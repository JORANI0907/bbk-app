import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendByTemplate } from '@/lib/template-sender'
import type { NotificationContext } from '@/lib/notification-variables'
import { saveNotificationHistory } from '@/lib/notification'
import { appendBothNotificationLogs } from '@/lib/notification-log'

const CRON_SECRET = process.env.CRON_SECRET

function getKSTToday(): string {
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return nowKST.toISOString().slice(0, 10)
}

// 오후 슬롯(KST 12:00 이후) 발송 여부 판정 — 오전 06:00 발송과 별개로 오후 재발송을 허용
function alreadySentInAfternoon(
  log: Array<{ type: string; sent_at: string }>,
  type: string,
  todayKST: string,
): boolean {
  return log.some((entry) => {
    if (entry.type !== type) return false
    if (!entry.sent_at.startsWith(todayKST)) return false
    const hour = parseInt(entry.sent_at.slice(11, 13), 10)
    return hour >= 12
  })
}

const NOTIFY_TO_STATUS: Record<string, string> = {
  '결제알림':               '결제',
  '결제알림(현금)':         '결제',
  '결제알림(카드,플렛폼)':  '결제',
  '결제요청알림(카드)':     '결제',
}
const NOTIFY_TO_PAYMENT_STATUS_DETAIL: Record<string, string> = {
  '결제알림':               '결제',
  '결제알림(현금)':         '결제',
  '결제알림(카드,플렛폼)':  '결제',
  '결제요청알림(카드)':     '결제(카드)',
}

async function sendAndLog(
  supabase: ReturnType<typeof createServiceClient>,
  app: Record<string, unknown>,
  type: string,
): Promise<'sent' | 'skipped_auto_off' | 'skipped_applicable_types'> {
  const serviceType = String(app.service_type ?? '')
  const suffix = serviceType === '1회성케어'    ? '_1회성'
               : serviceType === '정기딥케어'   ? '_정기딥'
               : serviceType === '정기엔드케어' ? '_정기엔드'
               : ''
  const lookupCode = suffix ? `${type}${suffix}` : type

  const { data: tpl } = await supabase
    .from('notification_templates')
    .select('auto_used, send_mode, applicable_types, is_active')
    .eq('code', lookupCode)
    .maybeSingle()

  if (!tpl || !tpl.is_active || !tpl.auto_used || tpl.send_mode !== 'auto') {
    return 'skipped_auto_off'
  }

  const applicable = (tpl.applicable_types as string[] | null) ?? []
  if (applicable.length > 0 && !applicable.includes(serviceType)) {
    return 'skipped_applicable_types'
  }

  const phone = String(app.phone ?? '').replace(/-/g, '')
  const context: NotificationContext = {
    application: {
      business_name: (app.business_name as string | null) ?? null,
      business_number: (app.business_number as string | null) ?? null,
      owner_name: (app.owner_name as string | null) ?? null,
      phone: (app.phone as string | null) ?? null,
      email: (app.email as string | null) ?? null,
      address: (app.address as string | null) ?? null,
      construction_date: (app.construction_date as string | null) ?? null,
      construction_time: (app.construction_time as string | null) ?? null,
      business_hours_start: (app.business_hours_start as string | null) ?? null,
      business_hours_end: (app.business_hours_end as string | null) ?? null,
      pre_meeting_at: (app.pre_meeting_at as string | null) ?? null,
      payment_method: (app.payment_method as string | null) ?? null,
      account_number: (app.account_number as string | null) ?? null,
      supply_amount: (app.supply_amount as number | null) ?? null,
      vat: (app.vat as number | null) ?? null,
      deposit: (app.deposit as number | null) ?? null,
      balance: (app.balance as number | null) ?? null,
      deposit_payment_url: (app.deposit_payment_url as string | null) ?? null,
      balance_payment_url: (app.balance_payment_url as string | null) ?? null,
      care_scope: (app.care_scope as string | null) ?? null,
      parking: (app.parking as string | null) ?? null,
      elevator: (app.elevator as string | null) ?? null,
      building_access: (app.building_access as string | null) ?? null,
      access_method: (app.access_method as string | null) ?? null,
      drive_folder_url: (app.drive_folder_url as string | null) ?? null,
      request_notes: (app.request_notes as string | null) ?? null,
    },
  }

  const result = await sendByTemplate(lookupCode, phone, context)
  if (!result.ok) {
    throw new Error(`SMS 발송 실패: ${result.reason}${result.details ? ` (${result.details})` : ''}`)
  }

  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const nowIso = nowKST.toISOString().replace('Z', '+09:00')
  const existLog = Array.isArray(app.notification_log)
    ? (app.notification_log as Array<{ type: string; sent_at: string; phone: string; method: string }>)
    : []
  const newEntry = { type, sent_at: nowIso, phone, method: 'auto' as const, channel: result.type }

  const extraAppFields: Record<string, unknown> = {}
  const newStatus = NOTIFY_TO_STATUS[type]
  if (newStatus) extraAppFields.status = newStatus
  const newPayment = NOTIFY_TO_PAYMENT_STATUS_DETAIL[type]
  if (newPayment) extraAppFields.payment_status_detail = newPayment

  await appendBothNotificationLogs(supabase, {
    appId: app.id as string,
    customerId: app.customer_id as string | null,
    existingAppLog: existLog,
    entry: newEntry,
    extraAppFields,
  })

  await saveNotificationHistory({
    category: 'sms',
    type,
    body: result.text,
    method: 'auto',
    recipientType: 'customer',
    recipientPhone: phone,
    metadata: {
      application_id: app.id as string,
      business_name: app.business_name as string,
      channel: result.type,
      source: 'cron/payment-reminders-afternoon',
    },
    status: 'sent',
  })

  return 'sent'
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const todayKST = getKSTToday()
  const supabase = createServiceClient()

  // 일시정지(status='paused') 고객 ID 세트 — 알림 대상 제외용.
  const { data: pausedRows } = await supabase
    .from('customers')
    .select('id')
    .eq('status', 'paused')
    .is('deleted_at', null)
  const pausedCustomerIds = new Set((pausedRows ?? []).map(c => c.id as string))

  // 결제알림 오후 재발송 (독촉).
  // 오전 06:00 발송 이력이 있어도 오후 슬롯(12:00 이후)에 미발송이면 발송.
  //
  // 판정 규칙 (단순): 세부화면의 '결제완료' 버튼이 눌렸는가 = payment_status_detail 이 완료 값인가.
  //   - '계산서발행완료'는 세금계산서 발행만 된 상태로 결제 여부와 무관 → PAID 판정 제외.
  //   - 21일 시간 필터는 과거 관행으로 누적된 '계산서발행완료' 건이 재발송되는 사고 방지용 안전장치.
  // 세금계산서 발행은 결제 전에도 가능 → '계산서발행완료' 는 결제완료 상태에서 제외.
  // UI 의 PAYMENT_COMPLETE_STATUSES 와 동일.
  const PAID_STATUS_DETAILS = ['결제완료','결제완료(잔금)','카드결제 완료','비과세']

  // KST 기준 21일 전 날짜
  const cutoffDate = new Date(Date.now() + 9 * 60 * 60 * 1000 - 21 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10)

  type AppRow = Record<string, unknown> & {
    customers?: { payment_status_detail: string | null } | null
  }

  const { data: apps } = await supabase
    .from('service_applications')
    .select('*, customers(payment_status_detail)')
    // 세금계산서 발행 후에도 실제 결제 안 됐으면 알림 계속
    .in('status', ['작업완료', '결제', '계산서발행완료'])
    // 1회성케어 전용. 정기딥/정기엔드는 service_billings 기반의
    // billing-payment-reminders 크론이 담당하므로 여기서 제외.
    .eq('service_type', '1회성케어')
    .gt('supply_amount', 0)
    .is('deleted_at', null)
    .gte('construction_date', cutoffDate)
    // balance_paid_at 이 세팅됐으면 잔금 입금 완료 → skip.
    // payment_status_detail 이 '결제'로 남아있어도 balance_paid_at 이 있으면 실제 결제완료.
    .is('balance_paid_at', null)

  let sent = 0, failed = 0, skipped = 0
  for (const app of ((apps ?? []) as AppRow[])) {
    if (!app.phone) { skipped++; continue }
    if (app.customer_id && pausedCustomerIds.has(app.customer_id as string)) { skipped++; continue }

    const appPay = app.payment_status_detail as string | null
    const custPay = app.customers?.payment_status_detail ?? null
    const isPaid =
      (appPay && PAID_STATUS_DETAILS.includes(appPay)) ||
      (custPay && PAID_STATUS_DETAILS.includes(custPay))
    if (isPaid) { skipped++; continue }

    const pm = String(app.payment_method ?? '')
    let billingType: string
    if (pm === '현금(계산서 희망)') {
      billingType = '결제알림'
    } else if (pm === '현금(비과세)') {
      billingType = '결제알림(현금)'
    } else if (pm === '카드(온라인 간편결제)' || pm === '플랫폼') {
      billingType = '결제요청알림(카드)'
    } else {
      skipped++; continue
    }

    const log = Array.isArray(app.notification_log) ? app.notification_log : []
    if (alreadySentInAfternoon(log, billingType, todayKST)) { skipped++; continue }

    try {
      const outcome = await sendAndLog(supabase, app, billingType)
      if (outcome === 'sent') sent++
      else skipped++
    } catch { failed++ }
  }

  return NextResponse.json({
    ok: true,
    date: todayKST,
    slot: 'afternoon',
    results: [{ type: '결제알림', sent, failed, skipped }],
  })
}
