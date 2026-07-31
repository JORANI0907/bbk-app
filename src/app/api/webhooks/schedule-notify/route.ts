// P2-25 / Phase 27-AP: 예약 알림 자동 발송 웹훅
// Make.com에서 매일 오전 6시에 호출 (KST)
// 예약당일알림 (오늘 시공일자, 배정완료 건)
// 예약1일전알림 (내일 시공일자, 배정완료 건)
//
// Phase 27-AP: 본문 하드코딩 제거 → notification_templates 참조.
// 관리자가 알림 관리에서 auto_used=false 로 끄면 이 웹훅도 skip.
// SMS 본문 편집은 즉시 실 발송에 반영됨.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendByTemplate } from '@/lib/template-sender'
import { notifySlack } from '@/lib/slack'
import { saveNotificationHistory } from '@/lib/notification'
import type { NotificationContext } from '@/lib/notification-variables'

// 알림 발송 대상 계약상태
const VALID_STATUSES = ['예약확정', '배정완료', '계약완료']

// Phase 27-AP: 시간대 안내 문구는 이제 template body에서 관리자가 편집.
// (calcRequestTime 은 하드코딩 SMS 제거로 dead code — 삭제됨)

interface ServiceApplication {
  id: string
  owner_name: string
  business_name: string
  phone: string
  construction_date: string | null
  business_hours_start: string | null
  business_hours_end: string | null
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
  const secret = request.headers.get('x-webhook-secret')
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // Phase 27-AP: 두 template의 활성/자동 스위치 조회. 꺼져 있으면 그 유형은 skip.
  // Phase 27-AQ: linked_progress_status / linked_payment_status 도 함께 조회 → 발송 성공 시 application 자동 갱신.
  const { data: templatesData } = await supabase
    .from('notification_templates')
    .select('code, auto_used, is_active, linked_progress_status, linked_payment_status')
    .in('code', ['예약당일알림', '예약1일전알림'])
  const canSend: Record<string, boolean> = {}
  const linkedProgress: Record<string, string | null> = {}
  const linkedPayment: Record<string, string | null> = {}
  for (const t of (templatesData ?? []) as Array<{
    code: string; auto_used: boolean; is_active: boolean;
    linked_progress_status: string | null; linked_payment_status: string | null;
  }>) {
    canSend[t.code] = t.is_active && t.auto_used
    linkedProgress[t.code] = t.linked_progress_status
    linkedPayment[t.code] = t.linked_payment_status
  }

  const todayKST = toKSTDateString(new Date())
  const tomorrowKST = addDays(todayKST, 1)
  const results = { today: 0, tomorrow: 0, skipped_switch_off: 0, errors: 0 }

  // 배정완료 + 유효 상태인 신청서 조회 (오늘 + 내일)
  const { data: apps, error } = await supabase
    .from('service_applications')
    .select('id, owner_name, business_name, phone, construction_date, business_hours_start, business_hours_end, status, assigned_to, notification_log')
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

    // Phase 27-AP: 관리자 스위치 게이트
    if (!canSend[notifyType]) {
      results.skipped_switch_off++
      continue
    }

    const existingLog: NotificationLogEntry[] = Array.isArray(app.notification_log)
      ? (app.notification_log as NotificationLogEntry[])
      : []

    // 같은 날 같은 유형 중복 발송 방지 (KST 기준 날짜 비교)
    const todayKST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const alreadySent = existingLog.some(
      (l) => l.type === notifyType && l.sent_at.slice(0, 10) === todayKST,
    )
    if (alreadySent) continue

    try {
      // Phase 27-AP: 하드코딩 SMS → template body 로 전환.
      // 관리자가 알림 관리 페이지에서 편집한 body 가 그대로 나감. 변수({{업체명}}, {{시공일자}}, {{영업종료시간}} 등) 자동 치환.
      const context: NotificationContext = {
        application: {
          business_name: app.business_name,
          owner_name: app.owner_name,
          phone: app.phone,
          construction_date: app.construction_date,
          business_hours_start: app.business_hours_start,
          business_hours_end: app.business_hours_end,
        },
      }
      const send = await sendByTemplate(notifyType, phone, context)
      if (!send.ok) {
        results.errors++
        continue
      }

      // KST 기준 타임스탬프
      const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
      const nowIso = nowKST.toISOString().replace('Z', '+09:00')
      const entry: NotificationLogEntry = {
        type: notifyType,
        sent_at: nowIso,
        phone,
        method: 'auto',
        template_id: send.templateId,
      }
      // Phase 27-AQ: notification_log 추가 + linked_* 자동 세팅 (한 번의 UPDATE로 병합)
      const patch: Record<string, unknown> = {
        notification_log: [entry, ...existingLog],
      }
      if (linkedProgress[notifyType]) patch.progress_status = linkedProgress[notifyType]
      if (linkedPayment[notifyType])  patch.payment_status_detail = linkedPayment[notifyType]
      await supabase.from('service_applications').update(patch).eq('id', app.id)

      // 수정 C: notification_history 기록 (문자알림관리 탭 표시 + Slack 로그)
      await saveNotificationHistory({
        category: 'sms',
        type: notifyType,
        body: send.text,
        method: 'auto',
        recipientType: 'customer',
        recipientPhone: phone,
        metadata: {
          application_id: app.id,
          business_name: app.business_name,
          channel: send.type,
          source: 'webhooks/schedule-notify',
        },
        status: 'sent',
      })

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
    skipped_switch_off: results.skipped_switch_off,
    errors: results.errors,
  })
}
