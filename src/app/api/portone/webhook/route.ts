import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from '@portone/server-sdk'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSlack } from '@/lib/slack'
import { getPortOneClient } from '@/lib/portone'
import { handleTransactionPaid } from '@/lib/portone-payment-handler'

const WEBHOOK_SECRET = process.env.PORTONE_WEBHOOK_SECRET ?? ''

// Transaction.Paid 처리는 src/lib/portone-payment-handler.ts 의 handleTransactionPaid 로 이관됨.
// 2026-10-15: cron/vbank-polling 폴링 안전망에서도 재사용하기 위해 lib 로 분리.

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
