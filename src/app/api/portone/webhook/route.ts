import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from '@portone/server-sdk'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSlack } from '@/lib/slack'
import { getPortOneClient } from '@/lib/portone'

const WEBHOOK_SECRET = process.env.PORTONE_WEBHOOK_SECRET ?? ''
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.bbkorea.co.kr'

// 자동 알림 발송 헬퍼 — fire-and-forget (실패해도 웹훅 성공 처리)
async function triggerAutoNotify(applicationId: string, type: string) {
  try {
    await fetch(`${APP_BASE_URL}/api/admin/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ application_id: applicationId, type, method: 'auto' }),
    })
  } catch {
    // 웹훅 재시도 방지 — 알림 실패는 조용히 무시
  }
}

// Transaction.Paid 웹훅 처리 — 가상계좌 입금 완료 시 DB 업데이트 + 알림
// 카드/계좌이체는 complete 라우트(브라우저 SDK 콜백)에서 이미 처리됨.
// deposit_paid_at/balance_paid_at 이 이미 설정된 건은 중복 처리 방지를 위해 스킵.
async function handleTransactionPaid(paymentId: string) {
  const supabase = createServiceClient()

  // deposit_portone_id 매칭 행 찾기 (deposit_paid_at 포함해 중복 체크)
  const { data: depositRow } = await supabase
    .from('service_applications')
    .select('id, owner_name, business_name, deposit, supply_amount, vat, deposit_paid_at, customer_id')
    .eq('deposit_portone_id', paymentId)
    .is('deleted_at', null)
    .maybeSingle()

  if (depositRow) {
    // 이미 complete 라우트에서 처리된 건 → 스킵 (카드/계좌이체 중복 알림 방지)
    if (depositRow.deposit_paid_at) return

    const nowIso = new Date().toISOString()
    // 원자적 업데이트: deposit_paid_at IS NULL 인 경우에만 실행 (race condition 방어)
    const { data: updated } = await supabase
      .from('service_applications')
      .update({
        deposit_paid_at: nowIso,
        payment_confirmed_at: nowIso,
        payment_status: 'paid',
        payment_status_detail: '예약금 입금',
        deposit: Number(depositRow.deposit ?? 0),
      })
      .eq('id', depositRow.id)
      .is('deposit_paid_at', null)
      .select('id')

    // 0행 업데이트 = 직전에 다른 요청이 이미 처리함 → 알림 스킵
    if (!updated || updated.length === 0) return

    // customers.deposit 금액 동기화
    if (depositRow.customer_id) {
      try {
        await supabase
          .from('customers')
          .update({ deposit_paid_at: nowIso, deposit: Number(depositRow.deposit ?? 0) })
          .eq('id', depositRow.customer_id)
      } catch { /* 동기화 실패 무시 */ }
    }

    // 2026-10-13: Slack 결제완료 보고 (가상계좌 입금 → webhook 경로. complete API 와 별개로 필수)
    sendSlack(
      `💳 *예약금(1차) 결제 완료 — 가상계좌 입금*\n` +
      `업체: ${depositRow.business_name ?? '-'} / 고객: ${depositRow.owner_name ?? '-'}\n` +
      `금액: ${Number(depositRow.deposit ?? 0).toLocaleString('ko-KR')}원\n` +
      `결제ID: ${paymentId}`,
    ).catch(() => {})

    // 2026-10-13: '예약확정알림'(수동 발송용)이 아니라 '예약금 입금완료 알림'(자동 발송용) 사용.
    //   complete API 와 일관성 유지.
    await triggerAutoNotify(depositRow.id, '예약금 입금완료 알림')
    return
  }

  const { data: balanceRow } = await supabase
    .from('service_applications')
    .select('id, owner_name, business_name, balance_paid_at')
    .eq('balance_portone_id', paymentId)
    .is('deleted_at', null)
    .maybeSingle()

  if (balanceRow) {
    if (balanceRow.balance_paid_at) return

    const nowIso = new Date().toISOString()
    const { data: updated } = await supabase
      .from('service_applications')
      .update({
        balance_paid_at: nowIso,
        payment_confirmed_at: nowIso,
        payment_status: 'paid',
        payment_status_detail: '결제완료',
      })
      .eq('id', balanceRow.id)
      .is('balance_paid_at', null)
      .select('id')

    if (!updated || updated.length === 0) return

    // customers.balance_paid_at 동기화
    try {
      const { data: link } = await supabase
        .from('service_applications')
        .select('customer_id')
        .eq('id', balanceRow.id)
        .maybeSingle()
      if (link?.customer_id) {
        await supabase
          .from('customers')
          .update({ balance_paid_at: nowIso })
          .eq('id', link.customer_id)
      }
    } catch { /* 동기화 실패 무시 */ }

    // 2026-10-13: Slack 결제완료 보고 (잔금도 가상계좌 입금 경로 포함).
    sendSlack(
      `💳 *잔금(2차) 결제 완료*\n` +
      `업체: ${balanceRow.business_name ?? '-'} / 고객: ${balanceRow.owner_name ?? '-'}\n` +
      `결제ID: ${paymentId}`,
    ).catch(() => {})

    // triggerAutoNotify → notify API → Slack 으로 통합 처리 (중복 방지)
    await triggerAutoNotify(balanceRow.id, '결제완료알림(잔금)')
  }
}

// 가상계좌 발급 완료 웹훅 처리 — PortOne V2는 webhook payload에 메타데이터만 담고
// 상세 가상계좌 정보는 getPayment API로 조회해야 함 (2026-10-12 Slack payload로 확인).
async function handleVirtualAccountIssued(paymentId: string, event: Record<string, unknown>): Promise<void> {
  void event // webhook payload는 트리거용, 실제 정보는 getPayment로 조회
  const client = getPortOneClient()
  if (!client) {
    await sendSlack(`⚠️ 가상계좌 webhook: PortOne 클라이언트 미설정 (STORE_ID/API_SECRET 확인)`).catch(() => {})
    return
  }

  let payment: Record<string, unknown>
  try {
    payment = await client.payment.getPayment({ paymentId }) as Record<string, unknown>
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await sendSlack(`⚠️ getPayment 실패 — ${paymentId}\n${msg}`).catch(() => {})
    return
  }

  // PortOne V2 응답 구조: payment.method 안에 가상계좌 정보가 담김 (PG별 필드명 다를 수 있어 방어적)
  const method = (payment.method as Record<string, unknown>) ?? {}
  const virtualAccount = (payment.virtualAccount as Record<string, unknown>)
                        ?? (method.virtualAccount as Record<string, unknown>)
                        ?? {}

  const accountNumber = String(
    virtualAccount.accountNumber ?? method.accountNumber ?? ''
  )
  const bankName = String(
    virtualAccount.bank ?? virtualAccount.bankName
    ?? method.bank ?? method.bankName ?? ''
  )
  const expiryRaw = virtualAccount.accountExpiry ?? virtualAccount.expiredAt
                   ?? method.accountExpiry ?? payment.expiredAt ?? null
  const expiredAt = expiryRaw
    ? (() => { try { return new Date(String(expiryRaw)).toISOString() } catch { return null } })()
    : null

  // 추출 실패 시 getPayment 전체 응답 Slack 로깅 (PortOne 응답 구조 역추적 가능)
  if (!accountNumber || !bankName) {
    await sendSlack(
      `⚠️ *가상계좌 getPayment 응답 추출 실패*\n` +
      `paymentId: ${paymentId}\n` +
      `getPayment 응답: \`\`\`${JSON.stringify(payment).slice(0, 1500)}\`\`\``
    ).catch(() => {})
    return
  }

  const supabase = createServiceClient()
  // 2026-10-13 race condition 안전망: issue-payment-link 가 아직 DB 에 paymentId 를 저장하기 전
  //   PortOne webhook 이 먼저 도착하는 경우 "not found" 에러 → 1초 간격 3회 재시도.
  // 2026-10-15 잔금 가상계좌 발급 지원: deposit_portone_id 조회 실패 시 balance_portone_id 로 재조회.
  //   잔금 가상계좌 발급 시 paymentId 끝에 '_balance' 가 붙어 depositId와 다름 → 둘 다 체크 필요.
  let appRow: { id: string; business_name: string | null; owner_name: string | null; virtual_account_number: string | null } | null = null
  let fetchError: { message: string } | null = null
  let matchedField: 'deposit_portone_id' | 'balance_portone_id' | null = null
  for (let i = 0; i < 3; i++) {
    // 먼저 deposit 매칭
    const { data: depData, error: depErr } = await supabase
      .from('service_applications')
      .select('id, business_name, owner_name, virtual_account_number')
      .eq('deposit_portone_id', paymentId)
      .is('deleted_at', null)
      .maybeSingle()
    if (depData) { appRow = depData; matchedField = 'deposit_portone_id'; break }
    fetchError = depErr

    // 없으면 balance 매칭 시도 (잔금 가상계좌)
    const { data: balData, error: balErr } = await supabase
      .from('service_applications')
      .select('id, business_name, owner_name, virtual_account_number')
      .eq('balance_portone_id', paymentId)
      .is('deleted_at', null)
      .maybeSingle()
    if (balData) { appRow = balData; matchedField = 'balance_portone_id'; break }
    fetchError = balErr

    if (i < 2) await new Promise((r) => setTimeout(r, 1000))
  }

  if (fetchError || !appRow) {
    await sendSlack(
      `⚠️ 가상계좌 webhook: service_applications 조회 실패 (3회 재시도 후) paymentId=${paymentId} err=${fetchError?.message ?? 'not found'}`
    ).catch(() => {})
    return
  }
  void matchedField // 추후 구분 로깅 필요 시 사용

  // 이미 저장돼 있으면 중복 저장 스킵 (멱등성)
  if (appRow.virtual_account_number) return

  const { error: updateError } = await supabase
    .from('service_applications')
    .update({
      virtual_account_number: accountNumber,
      virtual_account_bank: bankName,
      virtual_account_expired_at: expiredAt,
    })
    .eq('id', appRow.id)

  if (updateError) {
    await sendSlack(
      `❌ 가상계좌 DB 저장 실패: ${appRow.business_name} / ${appRow.owner_name}\n` +
      `paymentId: ${paymentId}\nerror: ${updateError.message}`
    ).catch(() => {})
    return
  }

  await sendSlack(
    `✅ 가상계좌 발급·저장 완료\n` +
    `업체: ${appRow.business_name} (${appRow.owner_name})\n` +
    `계좌: ${bankName} ${accountNumber}` +
    (expiredAt ? `\n만료: ${expiredAt.slice(0, 16).replace('T', ' ')} KST` : '')
  ).catch(() => {})
}

// 결제 실패 웹훅 처리 — PortOne getPayment 호출해서 실패 사유(reason/pgMessage/pgCode) 추출.
// 2026-10-15: 과거엔 Slack 로그만 찍고 사유 몰랐음(이신열 건) → 상세 사유 로깅으로 디버깅 가능하게.
async function handleTransactionFailed(paymentId: string): Promise<void> {
  const client = getPortOneClient()
  if (!client) {
    await sendSlack(`❌ 포트원 결제 실패 웹훅 (PortOne 클라이언트 미설정): ${paymentId}`).catch(() => {})
    return
  }

  let payment: Record<string, unknown>
  try {
    payment = await client.payment.getPayment({ paymentId }) as Record<string, unknown>
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await sendSlack(`❌ 포트원 결제 실패 웹훅 (getPayment 실패): ${paymentId}\n${msg}`).catch(() => {})
    return
  }

  // PortOne V2: failure 객체에 reason, pgCode, pgMessage 담김
  const failure = (payment.failure as Record<string, unknown>) ?? {}
  const reason    = String(failure.reason ?? '-')
  const pgCode    = String(failure.pgCode ?? '-')
  const pgMessage = String(failure.pgMessage ?? '-')

  // 신청서 매칭 (deposit/balance 둘 다 체크)
  const supabase = createServiceClient()
  const { data: depRow } = await supabase
    .from('service_applications')
    .select('business_name, owner_name')
    .eq('deposit_portone_id', paymentId).is('deleted_at', null).maybeSingle()
  const { data: balRow } = depRow ? { data: null } : await supabase
    .from('service_applications')
    .select('business_name, owner_name')
    .eq('balance_portone_id', paymentId).is('deleted_at', null).maybeSingle()
  const matchedRow = depRow ?? balRow
  const stageLabel = depRow ? '예약금(1차)' : balRow ? '잔금(2차)' : '미매칭'
  const businessInfo = matchedRow
    ? `${matchedRow.business_name ?? '-'} (${matchedRow.owner_name ?? '-'})`
    : '매칭 신청서 없음'

  await sendSlack(
    `❌ *포트원 결제 실패 — ${stageLabel}*\n` +
    `업체: ${businessInfo}\n` +
    `paymentId: ${paymentId}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `사유(reason): ${reason}\n` +
    `PG 메시지: ${pgMessage}\n` +
    `PG 코드: ${pgCode}`
  ).catch(() => {})
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()

    // 웹훅 시크릿이 설정된 경우에만 서명 검증
    if (WEBHOOK_SECRET) {
      try {
        await Webhook.verify(WEBHOOK_SECRET, rawBody, {
          'webhook-id':        request.headers.get('webhook-id')        ?? '',
          'webhook-timestamp': request.headers.get('webhook-timestamp') ?? '',
          'webhook-signature': request.headers.get('webhook-signature') ?? '',
        })
      } catch {
        return NextResponse.json({ error: '웹훅 서명 검증 실패' }, { status: 401 })
      }
    }

    const event = JSON.parse(rawBody) as Record<string, unknown>
    const type      = String(event.type ?? '')
    const paymentId = String((event.data as Record<string,unknown>)?.paymentId ?? '')

    switch (type) {
      case 'Transaction.Paid':
        await handleTransactionPaid(paymentId)
        break
      case 'Transaction.VirtualAccountIssued':
        // 2026-10-12 수정: 과거엔 "issue-payment-link에서 이미 처리됨"으로 가정하고 로그만 찍었으나,
        //   PortOne V2 payInstantly 응답에 가상계좌 정보가 즉시 안 올 수 있음(비동기 발급).
        //   그래서 webhook에서 가상계좌 정보 추출 → DB 저장을 명시적으로 처리.
        await handleVirtualAccountIssued(paymentId, event)
        break
      case 'Transaction.Failed':
        await handleTransactionFailed(paymentId)
        break
      default:
        // 미처리 이벤트 무시
        break
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
