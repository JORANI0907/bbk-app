import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSmsOrLms } from '@/lib/solapi'
import { sendByTemplate } from '@/lib/template-sender'
import type { NotificationContext } from '@/lib/notification-variables'
import { saveNotificationHistory } from '@/lib/notification'
import { appendBothNotificationLogs } from '@/lib/notification-log'

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

// Phase 8-B: 진행/결제 상태 매핑 (dual-write용)
const NOTIFY_TO_PROGRESS_STATUS: Record<string, string> = {
  '예약1일전알림': '예약1일전',
  '예약당일알림':  '예약당일',
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
  const newProgress = NOTIFY_TO_PROGRESS_STATUS[type]
  if (newProgress) extraAppFields.progress_status = newProgress
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

  // 일시정지(status='paused') 고객 ID 세트 — 모든 알림 섹션에서 skip 대상.
  // 진입점에서 1회 조회 후 각 루프에서 참조 (섹션별 재조회 방지).
  const { data: pausedRows } = await supabase
    .from('customers')
    .select('id')
    .eq('status', 'paused')
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

  // ── 1. 예약1일전알림: 내일 시공 + 예약확정 + 담당자 배정 ──────────
  //     정기엔드케어 제외 (작업완료알림만 발송)
  {
    const { data: apps } = await supabase
      .from('service_applications')
      .select('*')
      .eq('status', '예약확정')
      .eq('construction_date', tomorrowKST)
      .not('assigned_to', 'is', null)
      .neq('service_type', '정기엔드케어')
      .is('deleted_at', null)

    let sent = 0, failed = 0, skipped = 0
    for (const app of (apps ?? [])) {
      if (!app.phone) { skipped++; continue }
      if (app.customer_id && pausedCustomerIds.has(app.customer_id as string)) { skipped++; continue }
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

  // ── 2. 예약당일알림: 오늘 시공 + (예약확정|예약1일전) + 담당자 배정 ─
  //     정기엔드케어 제외 (작업완료알림만 발송)
  {
    const { data: apps } = await supabase
      .from('service_applications')
      .select('*')
      .in('status', ['예약확정', '예약1일전'])
      .eq('construction_date', todayKST)
      .not('assigned_to', 'is', null)
      .neq('service_type', '정기엔드케어')
      .is('deleted_at', null)

    let sent = 0, failed = 0, skipped = 0
    for (const app of (apps ?? [])) {
      if (!app.phone) { skipped++; continue }
      if (app.customer_id && pausedCustomerIds.has(app.customer_id as string)) { skipped++; continue }
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
      .neq('service_type', '정기엔드케어')
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
      if (alreadySentToday(log, billingType, todayKST)) { skipped++; continue }

      try {
        const outcome = await sendAndLog(supabase, app, billingType, '-', NOTIFY_TO_STATUS)
        if (outcome === 'sent') sent++
        else skipped++
      } catch { failed++ }
    }
    results.push({ type: '결제알림', sent, failed, skipped })
  }

  // ── 4. 정기결제알림: service_billings 기반 ─────────────────
  //     Phase 27-U (v11 완전 반영): 유형별 트리거 조건 분리
  //     - 정기엔드케어: due_date <= today (결제일 도래 후 매일)
  //     - 정기딥케어  : 그 달 시공(service_applications) 모두 '작업완료' 후 매일
  //                     (PaymentIssuesSummary v11 판정과 100% 동일 조건)
  //     - annual (재계약 안내): due_date <= today, 1회성 status='reminded' 로 종료
  //     - 공통: status='pending' AND last_notified_at 오늘 아니면 발송
  //     - 정기딥: 그 달의 마지막 시공 notification_log 에도 기록 → UI 노출
  {
    const ADMIN_PHONE = '01054344877'
    const currentMonth = todayKST.slice(0, 7)   // '2026-08'

    type BillingRow = {
      id: string
      billing_type: string
      billing_period: string
      due_date: string
      amount: number
      last_notified_at: string | null
      customers: {
        id: string
        business_name: string
        contact_name: string | null
        contact_phone: string | null
        customer_type: string | null
        payment_method: string | null
        account_number: string | null
        billing_amount: number | null
        billing_next_date: string | null
      }
    }

    // due_date 조건 제거 — 유형별 트리거는 아래에서 각자 판정
    const { data: billings } = await supabase
      .from('service_billings')
      .select(`
        id, billing_type, billing_period, due_date, amount, last_notified_at,
        customers!inner(
          id, business_name, contact_name, contact_phone,
          customer_type, payment_method, account_number,
          billing_amount, billing_next_date
        )
      `)
      .eq('status', 'pending')
      .in('customers.customer_type', ['정기딥케어', '정기엔드케어'])

    let sent = 0, failed = 0, skipped = 0

    for (const row of (billings ?? []) as unknown as BillingRow[]) {
      const cust = row.customers

      // 일시정지 고객은 정기결제알림 대상에서 제외
      if (pausedCustomerIds.has(cust.id)) { skipped++; continue }

      // 오늘 이미 발송한 청구는 skip (KST 기준 날짜 비교)
      if (row.last_notified_at && row.last_notified_at.slice(0, 10) === todayKST) {
        skipped++
        continue
      }

      const nowKSTIso = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('Z', '+09:00')

      // ── 연간: 관리자에게 재계약 안내 SMS (due_date 도래 후 1회, status='reminded' 로 종료) ──
      if (row.billing_type === 'annual') {
        if (row.due_date > todayKST) { skipped++; continue }
        const msg = `[BBK 공간케어] 연간 계약 갱신 필요\n${cust.business_name} 고객의 연간 계약 결제일(${row.due_date})이 도래했습니다.\n재계약 진행을 확인해 주세요.`
        try {
          await sendSmsOrLms(ADMIN_PHONE, msg, {})
          await supabase.from('service_billings')
            .update({ status: 'reminded', last_notified_at: nowKSTIso })
            .eq('id', row.id)
          sent++
        } catch { failed++ }
        continue
      }

      // ── 월간 유형별 트리거 조건 판정 ─────────────────────────────
      if (cust.customer_type === '정기엔드케어') {
        // 정기엔드: 결제일 도래 후만 발송
        if (row.due_date > todayKST) { skipped++; continue }
      } else if (cust.customer_type === '정기딥케어') {
        // 정기딥: 미래 달 청구는 제외
        if (row.billing_period > currentMonth) { skipped++; continue }

        // 그 달의 시공(service_applications) 모두 '작업완료' 여야 발송
        const [y, m] = row.billing_period.split('-').map(Number)
        const monthStart = `${row.billing_period}-01`
        const nextMonth = m === 12
          ? `${y + 1}-01-01`
          : `${y}-${String(m + 1).padStart(2, '0')}-01`

        const { data: monthApps } = await supabase
          .from('service_applications')
          .select('id, progress_status')
          .eq('customer_id', cust.id)
          .gte('construction_date', monthStart)
          .lt('construction_date', nextMonth)
          .is('deleted_at', null)

        // 그 달에 시공 스케줄 없으면 발송 안 함 (이상 케이스, 데이터 확인 필요)
        if (!monthApps || monthApps.length === 0) { skipped++; continue }

        // 하나라도 '작업완료' 아닌 것이 있으면 발송 안 함
        const allCompleted = monthApps.every(a => a.progress_status === '작업완료')
        if (!allCompleted) { skipped++; continue }
      }

      // ── 월간: 고객에게 정기결제알림 (매일 반복) ──
      const phone = (cust.contact_phone ?? '').replace(/-/g, '')
      if (!phone) { skipped++; continue }

      const pm = cust.payment_method ?? ''
      const isCard = pm === '카드(온라인 간편결제)'
      const suffix = cust.customer_type === '정기딥케어' ? '_정기딥' : '_정기엔드'
      const templateCode = isCard ? `정기결제알림(카드)${suffix}` : `정기결제알림${suffix}`

      // billing 실제 금액·결제일로 context 채우기
      const ctx: NotificationContext = {
        customer: {
          business_name: cust.business_name,
          contact_name: cust.contact_name,
          contact_phone: cust.contact_phone,
          payment_method: cust.payment_method,
          account_number: cust.account_number,
          billing_amount: row.amount,        // {{계약금액}} 소스
          billing_next_date: row.due_date,   // {{다음결제일}} 소스
        },
      }

      try {
        const result = await sendByTemplate(templateCode, phone, ctx)
        if (result.ok) {
          // 매일 반복 발송을 위해 status 는 pending 유지, last_notified_at 만 업데이트
          await supabase.from('service_billings')
            .update({ last_notified_at: nowKSTIso })
            .eq('id', row.id)

          await saveNotificationHistory({
            category: 'sms',
            type: '정기결제알림',
            body: result.text,
            method: 'auto',
            recipientType: 'customer',
            recipientPhone: phone,
            metadata: {
              billing_id: row.id,
              customer_id: cust.id,
              business_name: cust.business_name,
              channel: result.type,
              source: 'cron/reservation-reminders',
            },
            status: 'sent',
          })

          // 정기딥 UI 노출: 그 달 마지막 시공 행 notification_log 에도 기록
          if (cust.customer_type === '정기딥케어') {
            const [y, m] = row.billing_period.split('-').map(Number)
            const monthStart = `${row.billing_period}-01`
            const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
            const { data: latestApp } = await supabase
              .from('service_applications')
              .select('id, notification_log')
              .eq('customer_id', cust.id)
              .gte('construction_date', monthStart)
              .lt('construction_date', nextMonth)
              .is('deleted_at', null)
              .order('construction_date', { ascending: false })
              .limit(1)
              .maybeSingle()

            if (latestApp) {
              const existLog = Array.isArray(latestApp.notification_log)
                ? (latestApp.notification_log as Array<Record<string, unknown>>)
                : []
              const newEntry = {
                type: '정기결제알림',
                sent_at: nowKSTIso,
                phone,
                method: 'auto' as const,
                channel: result.type,
                billing_id: row.id,
                billing_period: row.billing_period,
              }
              await supabase.from('service_applications')
                .update({ notification_log: [...existLog, newEntry] })
                .eq('id', latestApp.id)
            }
          }

          sent++
        } else {
          skipped++
        }
      } catch { failed++ }
    }

    results.push({ type: '정기결제알림', sent, failed, skipped })
  }

  return NextResponse.json({ ok: true, date: todayKST, results })
}
