// P2-25: 예약 알림 자동 발송 웹훅
// Make.com에서 매일 오전 8시에 호출
// 예약당일알림 (오늘 시공일자, 배정완료 건)
// 예약1일전알림 (내일 시공일자, 배정완료 건)

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSMS } from '@/lib/solapi'
import { notifySlack } from '@/lib/slack'

// 알림 발송 대상 계약상태
const VALID_STATUSES = ['예약확정', '배정완료', '계약완료']

interface ServiceApplication {
  id: string
  owner_name: string
  business_name: string
  phone: string
  construction_date: string | null
  business_hours_start: string | null
  status: string
  assigned_to: string | null
  notification_log: NotificationLogEntry[] | null
}

interface NotificationLogEntry {
  type: string
  sent_at: string
  phone: string
  method: 'auto' | 'manual'
  template_id?: string
}

function toKSTDateString(date: Date): string {
  return date.toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).replace(/\. /g, '-').replace('.', '')
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00+09:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

async function appendNotificationLog(
  supabase: ReturnType<typeof createServiceClient>,
  appId: string,
  existingLog: NotificationLogEntry[],
  entry: NotificationLogEntry,
): Promise<void> {
  const updated = [entry, ...existingLog]
  await supabase
    .from('service_applications')
    .update({ notification_log: updated })
    .eq('id', appId)
}

export async function POST(request: NextRequest) {
  // 웹훅 시크릿 검증
  const secret = request.headers.get('x-webhook-secret')
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const todayKST = toKSTDateString(new Date())
  const tomorrowKST = addDays(todayKST, 1)

  const results = { today: 0, tomorrow: 0, errors: 0 }

  // 배정완료 + 유효 상태인 신청서 조회 (오늘 + 내일)
  const { data: apps, error } = await supabase
    .from('service_applications')
    .select('id, owner_name, business_name, phone, construction_date, business_hours_start, status, assigned_to, notification_log')
    .in('construction_date', [todayKST, tomorrowKST])
    .in('status', VALID_STATUSES)
    .not('assigned_to', 'is', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const targets = (apps ?? []) as ServiceApplication[]

  for (const app of targets) {
    const phone = (app.phone ?? '').replace(/-/g, '')
    if (!phone) continue

    const isToday = app.construction_date === todayKST
    const notifyType = isToday ? '예약당일알림' : '예약1일전알림'
    const time = app.business_hours_start ?? ''

    const existingLog: NotificationLogEntry[] = Array.isArray(app.notification_log)
      ? (app.notification_log as NotificationLogEntry[])
      : []

    // 같은 날 같은 유형 중복 발송 방지
    const today = new Date().toISOString().slice(0, 10)
    const alreadySent = existingLog.some(
      (l) => l.type === notifyType && l.sent_at.startsWith(today),
    )
    if (alreadySent) continue

    try {
      const message = isToday
        ? `[BBK 공간케어] ${app.owner_name}님, 오늘 ${time}에 방문 예정입니다.\n준비사항을 확인해주세요. 문의: 031-759-4877`
        : `[BBK 공간케어] ${app.owner_name}님, 내일 ${time}에 ${app.business_name} 방문 예정입니다.\n문의: 031-759-4877`

      await sendSMS(phone, message)

      const nowIso = new Date().toISOString()
      const entry: NotificationLogEntry = {
        type: notifyType,
        sent_at: nowIso,
        phone,
        method: 'auto',
      }

      await appendNotificationLog(supabase, app.id, existingLog, entry)

      await notifySlack({
        notifyType,
        customerName: app.owner_name ?? '',
        phone,
        businessName: app.business_name ?? '',
        constructionDate: app.construction_date,
        method: 'auto',
      }).catch(() => { /* Slack 실패는 무시 */ })

      if (isToday) results.today++
      else results.tomorrow++
    } catch {
      results.errors++
    }
  }

  return NextResponse.json({
    success: true,
    sent_today: results.today,
    sent_tomorrow: results.tomorrow,
    errors: results.errors,
  })
}
