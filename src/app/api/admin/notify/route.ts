import { NextRequest, NextResponse } from 'next/server'
import { sendSMS } from '@/lib/solapi'
import { createServiceClient } from '@/lib/supabase/server'
import { notifySlack } from '@/lib/slack'

// ─── 알림 유형 → 계약상태 자동변경 매핑 (P2-27/28) ──────────────
const NOTIFY_TO_STATUS: Record<string, string> = {
  '예약확정알림': '예약확정',
  '작업완료알림': '작업완료',
  '결제완료알림': '결제완료',
}

// ─── 알림 메시지 템플릿 ──────────────────────────────────────────
const TEMPLATES: Record<string, (data: Record<string, string>) => string> = {
  '예약확정알림':    (d) => `[BBK 공간케어] ${d.name}님, ${d.business_name} 예약이 확정되었습니다.\n방문일시: ${d.date} ${d.time}\n문의: 031-759-4877`,
  '예약1일전알림':  (d) => `[BBK 공간케어] ${d.name}님, 내일 ${d.time}에 ${d.business_name} 방문 예정입니다.\n문의: 031-759-4877`,
  '예약당일알림':   (d) => `[BBK 공간케어] ${d.name}님, 오늘 ${d.time}에 방문 예정입니다.\n준비사항을 확인해주세요. 문의: 031-759-4877`,
  '작업완료알림':   (d) => `[BBK 공간케어] ${d.name}님, ${d.business_name} 케어가 완료되었습니다.\n이용해주셔서 감사합니다. 문의: 031-759-4877`,
  '결제알림':       (d) => `[BBK 공간케어] ${d.name}님, 잔금 ${d.balance}원 결제를 요청드립니다.\n계좌: ${d.account} 문의: 031-759-4877`,
  '결제완료알림':   (d) => `[BBK 공간케어] ${d.name}님, 결제가 완료되었습니다. 감사합니다.\n문의: 031-759-4877`,
  '계산서발행완료알림': (d) => `[BBK 공간케어] ${d.name}님, 세금계산서가 발행되었습니다.\n확인 후 문의사항은 031-759-4877로 연락주세요.`,
  '예약금환급완료알림': (d) => `[BBK 공간케어] ${d.name}님, 예약금 환급이 완료되었습니다.\n문의: 031-759-4877`,
  '예약취소알림':   (d) => `[BBK 공간케어] ${d.name}님, ${d.business_name} 예약이 취소되었습니다.\n문의: 031-759-4877`,
  'A/S방문알림':    (d) => `[BBK 공간케어] ${d.name}님, A/S 방문일시: ${d.date} ${d.time}\n문의: 031-759-4877`,
  '방문견적알림':   (d) => `[BBK 공간케어] ${d.name}님, 방문견적 일시: ${d.date} ${d.time}\n문의: 031-759-4877`,
}

// ─── notification_log 항목 타입 ──────────────────────────────────
interface NotificationLogEntry {
  type: string
  sent_at: string
  phone: string
  method: 'auto' | 'manual'
  template_id?: string
}

export async function POST(request: NextRequest) {
  try {
    const { application_id, type, method = 'manual' } = await request.json() as {
      application_id: string
      type: string
      method?: 'auto' | 'manual'
    }
    if (!application_id || !type) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: app } = await supabase
      .from('service_applications')
      .select('*')
      .eq('id', application_id)
      .single()

    if (!app) return NextResponse.json({ error: '신청서를 찾을 수 없습니다.' }, { status: 404 })

    const templateFn = TEMPLATES[type]
    if (!templateFn) return NextResponse.json({ error: '알 수 없는 알림 유형입니다.' }, { status: 400 })

    const message = templateFn({
      name: app.owner_name ?? '',
      business_name: app.business_name ?? '',
      date: app.construction_date?.slice(0, 10) ?? app.submitted_at?.slice(0, 10) ?? '',
      time: app.business_hours_start ?? '',
      balance: String(app.balance ?? 0),
      account: app.account_number ?? '',
    })

    const phone = (app.phone ?? '').replace(/-/g, '')
    if (!phone) return NextResponse.json({ error: '전화번호가 없습니다.' }, { status: 400 })

    await sendSMS(phone, message)

    // ── P2-27/28: 계약상태 자동변경 ──────────────────────────────
    const newStatus = NOTIFY_TO_STATUS[type]
    const nowIso = new Date().toISOString()

    // ── P2-30: notification_log append ──────────────────────────
    const existingLog: NotificationLogEntry[] = Array.isArray(app.notification_log)
      ? (app.notification_log as NotificationLogEntry[])
      : []

    const newEntry: NotificationLogEntry = {
      type,
      sent_at: nowIso,
      phone,
      method,
    }

    const updatedLog = [newEntry, ...existingLog]

    const dbUpdates: Record<string, unknown> = { notification_log: updatedLog }
    if (newStatus) dbUpdates.status = newStatus

    await supabase
      .from('service_applications')
      .update(dbUpdates)
      .eq('id', application_id)

    // ── P2-29: Slack 보고 ────────────────────────────────────────
    await notifySlack({
      notifyType: type,
      customerName: app.owner_name ?? '',
      phone,
      businessName: app.business_name ?? '',
      constructionDate: app.construction_date?.slice(0, 10) ?? null,
      method,
    }).catch(() => { /* Slack 실패는 무시 */ })

    return NextResponse.json({ success: true, message, new_status: newStatus ?? null })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
