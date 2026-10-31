import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendByTemplate } from '@/lib/template-sender'
import type { NotificationContext } from '@/lib/notification-variables'
import { saveNotificationHistory } from '@/lib/notification'
import { appendBothNotificationLogs } from '@/lib/notification-log'
import { normalizePaymentMethod } from '@/lib/payment-methods'

const CRON_SECRET = process.env.CRON_SECRET

// ─── 시공시간 기반 요청시간 계산: 0h ~ +2h ───────────────────────
function calcConstructionRequestTime(timeStr: string | null | undefined): string {
  if (!timeStr) return '-'
  const match = timeStr.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return timeStr
  const h = parseInt(match[1], 10)
  const m = parseInt(match[2], 10)
  const startH = h % 24
  const endH   = (h + 2) % 24
  const fmt = (hour: number) => `${String(hour).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  return `${fmt(startH)} ~ ${fmt(endH)} 사이`
}

// ─── KST 기준 오늘/내일 날짜 계산 ────────────────────────────────
function getKSTDates() {
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const todayKST = nowKST.toISOString().slice(0, 10)
  const tomorrowKST = new Date(nowKST.getTime() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
  return { todayKST, tomorrowKST }
}

// ─── notification_log에 해당 type이 오늘 이미 발송됐는지 확인 ─────
function alreadySentToday(
  log: Array<{ type: string; sent_at: string }>,
  type: string,
  todayKST: string,
): boolean {
  return log.some(
    (entry) => entry.type === type && entry.sent_at.slice(0, 10) === todayKST,
  )
}

// ─── notification_log에 해당 type이 한 번이라도 발송됐는지 확인 ───
function alreadySentEver(
  log: Array<{ type: string }>,
  type: string,
): boolean {
  return log.some((entry) => entry.type === type)
}

const NOTIFY_TO_PAYMENT_STATUS_DETAIL: Record<string, string> = {
  '결제알림':               '결제',
  '결제알림(현금)':         '결제',
  '결제알림(카드,플렛폼)':  '결제',
  '결제요청알림(카드)':     '결제(카드)',
}

// ─── 단일 알림 발송 + log 업데이트 ─────────────────────────────────
// Phase 27-S: 3종 자동 알림 전부 DB template + sendByTemplate 로 통일.
// - auto_used=true 인 template 만 발송 (관리자가 관리 탭에서 켜야 활성)
// - applicable_types 검사 (신청서 service_type 매칭 안 되면 skip)
// - 카톡 알림톡(sendAlimtalk) 완전 폐기, SMS/LMS 로만 발송
async function sendAndLog(
  supabase: ReturnType<typeof createServiceClient>,
  app: Record<string, unknown>,
  type: string,
  assignedName: string,
  notifyToStatus: Record<string, string>,
): Promise<'sent' | 'skipped_auto_off' | 'skipped_applicable_types'> {
  void assignedName

  // 1) service_type 기반으로 유형별 분리 코드 결정
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

  // send_mode='auto' AND auto_used=true AND is_active=true 모두 충족해야 발송
  if (!tpl || !tpl.is_active || !tpl.auto_used || tpl.send_mode !== 'auto') {
    return 'skipped_auto_off'
  }

  // 유형별 분리 후 applicable_types는 단일 원소 배열 → 별도 검사 불필요
  // (기존 공유 템플릿에 대한 하위 호환: applicable_types에 serviceType 없으면 skip)
  const applicable = (tpl.applicable_types as string[] | null) ?? []
  if (applicable.length > 0 && !applicable.includes(serviceType)) {
    return 'skipped_applicable_types'
  }

  // 2) NotificationContext 구성 (application 필드 병합)
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

  // 3) sendByTemplate 호출 (유형별 분리 코드 사용)
  const result = await sendByTemplate(lookupCode, phone, context)
  if (!result.ok) {
    throw new Error(`SMS 발송 실패: ${result.reason}${result.details ? ` (${result.details})` : ''}`)
  }

  // 4) 이력 저장 (KST 기준 타임스탬프)
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const nowIso = nowKST.toISOString().replace('Z', '+09:00')
  const existLog  = Array.isArray(app.notification_log)
    ? (app.notification_log as Array<{ type: string; sent_at: string; phone: string; method: string }>)
    : []
  const newEntry = { type, sent_at: nowIso, phone, method: 'auto' as const, channel: result.type }

  // Phase 8-B: dual-write — 신규 두 컬럼도 함께 업데이트
  const extraAppFields: Record<string, unknown> = {}
  const newStatus = notifyToStatus[type]
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

  // 수정 C: notification_history 기록 (문자알림관리 탭 표시 + Slack 로그)
  // metadata.customer_id: 고객관리 발송이력 툴팁 조회 필터에 사용.
  await saveNotificationHistory({
    category: 'sms',
    type,
    body: result.text,
    method: 'auto',
    recipientType: 'customer',
    recipientPhone: phone,
    metadata: {
      application_id: app.id as string,
      customer_id: (app.customer_id as string | null) ?? null,
      business_name: app.business_name as string,
      channel: result.type,
      source: 'cron/reservation-reminders',
    },
    status: 'sent',
  })

  return 'sent'
}

// ─── 메인 핸들러 ─────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { todayKST, tomorrowKST } = getKSTDates()
  const supabase = createServiceClient()

  // 알림 대상 제외 고객 ID 세트 — 모든 알림 섹션에서 skip 대상.
  //  - status='paused': 서비스 자체 일시정지
  //  - auto_notification_paused=true: 서비스는 정상이지만 자동 알림만 중단
  //    (예: 월말 일괄 정산으로 별도 관리하는 고객)
  // 진입점에서 1회 조회 후 각 루프에서 참조 (섹션별 재조회 방지).
  const { data: pausedRows } = await supabase
    .from('customers')
    .select('id')
    .or('status.eq.paused,auto_notification_paused.eq.true')
    .is('deleted_at', null)
  const pausedCustomerIds = new Set((pausedRows ?? []).map(c => c.id as string))

  const NOTIFY_TO_STATUS: Record<string, string> = {
    '예약1일전알림':          '예약1일전',
    '예약당일알림':           '예약당일',
    '결제알림':               '결제',
    '결제알림(현금)':         '결제',
    '결제알림(카드,플렛폼)':  '결제',
    '결제요청알림(카드)':     '결제',
  }

  // 담당자 이름 캐싱 (N+1 방지)
  const userNameCache: Record<string, string> = {}
  async function getAssignedName(userId: string | null): Promise<string> {
    if (!userId) return '-'
    if (userNameCache[userId]) return userNameCache[userId]
    const { data: u } = await supabase.from('users').select('name').eq('id', userId).single()
    const name = u?.name ?? '-'
    userNameCache[userId] = name
    return name
  }

  const results: { type: string; sent: number; failed: number; skipped: number }[] = []

  // ── 1. 예약1일전알림: 내일 시공 + (예약금 완료 OR 정기딥) + 담당자 배정 ──
  //     정기엔드케어 제외 (작업완료알림만 발송)
  //     1회성/일반일정은 deposit_paid_at(예약금 완료 여부) 로 필터.
  //     정기딥케어는 예약금 모델이 없음(service_billings 월 청구) → 예약금 조건 우회,
  //     construction_date 도래하면 발송. (2026-10-21)
  {
    const { data: apps } = await supabase
      .from('service_applications')
      .select('*')
      .or('service_type.eq.정기딥케어,deposit_paid_at.not.is.null')
      .eq('construction_date', tomorrowKST)
      .not('assigned_to', 'is', null)
      .neq('service_type', '정기엔드케어')
      .is('deleted_at', null)

    let sent = 0, failed = 0, skipped = 0
    for (const app of (apps ?? [])) {
      if (!app.phone) { skipped++; continue }
      if (app.customer_id && pausedCustomerIds.has(app.customer_id as string)) { skipped++; continue }
      if (app.progress_status === '작업완료') { skipped++; continue }
      const log = Array.isArray(app.notification_log) ? app.notification_log : []
      if (alreadySentToday(log, '예약1일전알림', todayKST)) { skipped++; continue }

      const assignedName = await getAssignedName(app.assigned_to as string | null)
      try {
        const outcome = await sendAndLog(supabase, app as Record<string, unknown>, '예약1일전알림', assignedName, NOTIFY_TO_STATUS)
        if (outcome === 'sent') sent++
        else skipped++
      } catch { failed++ }
    }
    results.push({ type: '예약1일전알림', sent, failed, skipped })
  }

  // ── 2. 예약당일알림: 오늘 시공 + (예약금 완료 OR 정기딥) + 담당자 배정 ─
  //     정기엔드케어 제외 (작업완료알림만 발송)
  //     1회성/일반일정은 deposit_paid_at(예약금 완료 여부) 로 필터.
  //     정기딥케어는 예약금 모델이 없음(service_billings 월 청구) → 예약금 조건 우회,
  //     construction_date 도래하면 발송. (2026-10-21)
  {
    const { data: apps } = await supabase
      .from('service_applications')
      .select('*')
      .or('service_type.eq.정기딥케어,deposit_paid_at.not.is.null')
      .eq('construction_date', todayKST)
      .not('assigned_to', 'is', null)
      .neq('service_type', '정기엔드케어')
      .is('deleted_at', null)

    let sent = 0, failed = 0, skipped = 0
    for (const app of (apps ?? [])) {
      if (!app.phone) { skipped++; continue }
      if (app.customer_id && pausedCustomerIds.has(app.customer_id as string)) { skipped++; continue }
      if (app.progress_status === '작업완료') { skipped++; continue }
      const log = Array.isArray(app.notification_log) ? app.notification_log : []
      if (alreadySentToday(log, '예약당일알림', todayKST)) { skipped++; continue }

      const assignedName = await getAssignedName(app.assigned_to as string | null)
      try {
        const outcome = await sendAndLog(supabase, app as Record<string, unknown>, '예약당일알림', assignedName, NOTIFY_TO_STATUS)
        if (outcome === 'sent') sent++
        else skipped++
      } catch { failed++ }
    }
    results.push({ type: '예약당일알림', sent, failed, skipped })
  }

  // ── 3. 결제알림: 작업완료|결제 상태 + 오늘 미발송 ───────────────
  //     '작업완료(엔드)'는 정기엔드케어 전용 상태 → 상태 필터에서 제외
  //     service_type 필터도 추가 안전장치로 유지
  //     공급대가(supply_amount) 0원 또는 미입력 건 발송 제외
  //     결제완료 판정: service_applications 또는 customers 어느 쪽 payment_status_detail
  //     이라도 정산 완료 상태면 스킵 (관리자가 고객관리 UI에서 완료 처리한 케이스 방어)
  {
    // 판정 규칙 (단순): 세부화면의 '결제완료' 버튼이 눌렸는가 = payment_status_detail 이 완료 값인가.
    //   - '계산서발행완료'는 세금계산서 발행만 된 상태로 결제 여부와 무관 → PAID 판정 제외.
    //   - 21일 시간 필터는 과거 관행으로 누적된 '계산서발행완료' 건이 재발송되는 사고 방지용 안전장치.
    // 세금계산서 발행은 결제 전에도 가능 → '계산서발행완료' 는 결제완료 상태에서 제외.
    // UI 의 PAYMENT_COMPLETE_STATUSES 와 동일.
    const PAID_STATUS_DETAILS = ['결제완료','카드결제 완료','비과세']

    // KST 기준 21일 전 날짜
    const cutoffDate = new Date(Date.now() + 9 * 60 * 60 * 1000 - 21 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10)

    type AppRow = Record<string, unknown> & {
      customers?: { payment_status_detail: string | null } | null
    }

    const { data: apps } = await supabase
      .from('service_applications')
      .select('*, customers(payment_status_detail)')
      // progress_status = '작업완료' 인 것만 — status 컬럼 의존 제거
      // 세금계산서 발행(tax_invoice_issued)이나 순서 변경과 무관하게 작동
      .eq('progress_status', '작업완료')
      // 1회성케어 전용. 정기딥/정기엔드는 service_billings 기반의
      // cron/billing-notify 가 담당하므로 여기서 제외.
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

      const rawPm = String(app.payment_method ?? '')
      const pm = normalizePaymentMethod(rawPm)
      let billingType: string
      if (rawPm === '현금(계산서 희망)' || pm === 'virtual_account' || pm === 'bank_transfer') {
        billingType = '결제알림'
      } else if (pm === 'cash_untaxed') {
        billingType = '결제알림(현금)'
      } else if (pm === 'credit_card' || pm === 'platform') {
        billingType = '결제요청알림(카드)'
      } else {
        skipped++; continue
      }

      const log = Array.isArray(app.notification_log) ? app.notification_log : []
      if (alreadySentToday(log, billingType, todayKST)) { skipped++; continue }

      try {
        const outcome = await sendAndLog(supabase, app, billingType, '-', NOTIFY_TO_STATUS)
        if (outcome === 'sent') sent++
        else skipped++
      } catch { failed++ }
    }
    results.push({ type: '결제알림', sent, failed, skipped })
  }

  // ── 4. 정기결제알림 — 2026-11-01 cron/billing-notify 로 이관 ─────────
  //     정기(딥/엔드) 결제 안내는 /api/cron/billing-notify 하나가 전담한다.
  //     (청구서 notify_start_date 기준 당일·3일·7일 최대 3회, 결제 링크 포함, 빌링키 고객은 자동결제)

  return NextResponse.json({ ok: true, date: todayKST, results })
}
