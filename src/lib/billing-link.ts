/**
 * 정기 청구서(service_billings) 결제 링크 발급 (2026-11-01 lib 로 분리)
 *
 * 과거엔 /api/portone/issue-billing-link 라우트 안에만 있어 cron 들이 HTTP 로 자기 서버를
 * 다시 호출했다. 이제 서버 코드는 이 함수를 직접 부르고, 라우트는 얇은 껍데기만 남긴다.
 *
 * 저장:
 *   service_billings.payment_portone_id      = bbk_billing_{청구id 앞8자}_{timestamp}
 *   service_billings.payment_url             = {APP}/portone/billing-pay/{청구id}?pid=...
 *   service_billings.payment_method_snapshot = 고객 결제방식 스냅샷
 */

import { createServiceClient } from '@/lib/supabase/server'
import { getPortOneClient } from '@/lib/portone'

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.bbkorea.co.kr'

type Supabase = ReturnType<typeof createServiceClient>

export type IssueBillingLinkResult =
  | { ok: true; paymentId: string; paymentUrl: string; reused: boolean }
  | { ok: false; status: number; error: string }

/**
 * 결제 링크 발급. 이미 있으면 그대로 돌려준다(멱등).
 */
export async function issueBillingLink(supabase: Supabase, billingId: string): Promise<IssueBillingLinkResult> {
  const { data: billing, error: fetchErr } = await supabase
    .from('service_billings')
    .select('id, customer_id, status, payment_url, payment_portone_id')
    .eq('id', billingId)
    .maybeSingle()

  if (fetchErr || !billing) {
    return { ok: false, status: 404, error: fetchErr?.message ?? '결제 레코드를 찾을 수 없습니다' }
  }
  if (billing.status === 'paid') {
    return { ok: false, status: 409, error: '이미 결제 완료된 건입니다' }
  }
  if (billing.payment_url && billing.payment_portone_id) {
    return { ok: true, paymentId: String(billing.payment_portone_id), paymentUrl: String(billing.payment_url), reused: true }
  }

  let paymentMethodSnapshot: string | null = null
  if (billing.customer_id) {
    const { data: cust } = await supabase
      .from('customers')
      .select('payment_method')
      .eq('id', billing.customer_id)
      .maybeSingle()
    paymentMethodSnapshot = (cust?.payment_method as string | null) ?? null
  }

  const shortId = String(billing.id).replace(/-/g, '').slice(0, 8)
  const paymentId = String(billing.payment_portone_id ?? `bbk_billing_${shortId}_${Date.now()}`)
  const paymentUrl = `${APP_BASE_URL}/portone/billing-pay/${billing.id}?pid=${paymentId}`

  const { error: updateErr } = await supabase
    .from('service_billings')
    .update({
      payment_portone_id: paymentId,
      payment_url: paymentUrl,
      payment_method_snapshot: paymentMethodSnapshot,
    })
    .eq('id', billing.id)

  if (updateErr) {
    return { ok: false, status: 500, error: `DB 저장 실패: ${updateErr.message}` }
  }
  return { ok: true, paymentId, paymentUrl, reused: false }
}

export type RotateBillingPaymentIdResult =
  | { ok: true; paymentId: string; paymentUrl: string; previousPaymentId: string | null; vbankCancelled: boolean; note: string | null }
  | { ok: false; status: number; error: string }

/**
 * 결제 ID 초기화 (2026-11-03)
 *   관리자가 미리보기 중 가상계좌를 발급해 버리는 등, 결제 ID가 소진된 청구를 되살린다.
 *   1) 옛 ID가 가상계좌 발급 상태면 포트원에 발급 취소를 시도 (PG가 거절해도 계속 진행)
 *   2) 옛 ID는 previous_payment_ids 에 보관 → 옛 계좌로 뒤늦게 입금돼도 웹훅이 매칭
 *   3) 새 ID·새 링크 저장. 고객은 링크를 다시 열면 결제 방법 선택부터 시작.
 */
export async function rotateBillingPaymentId(supabase: Supabase, billingId: string): Promise<RotateBillingPaymentIdResult> {
  const { data: billing, error: fetchErr } = await supabase
    .from('service_billings')
    .select('id, status, payment_portone_id, previous_payment_ids')
    .eq('id', billingId)
    .maybeSingle()
  if (fetchErr || !billing) return { ok: false, status: 404, error: fetchErr?.message ?? '결제 레코드를 찾을 수 없습니다' }
  if (billing.status === 'paid') return { ok: false, status: 409, error: '이미 결제 완료된 건은 초기화할 수 없습니다' }

  const previousPaymentId = (billing.payment_portone_id as string | null) ?? null
  const { cancelled, note } = previousPaymentId
    ? await cancelIssuedVirtualAccount(previousPaymentId)
    : { cancelled: false, note: null }

  const shortId = String(billing.id).replace(/-/g, '').slice(0, 8)
  const paymentId = `bbk_billing_${shortId}_${Date.now()}`
  const paymentUrl = `${APP_BASE_URL}/portone/billing-pay/${billing.id}?pid=${paymentId}`
  const history = Array.isArray(billing.previous_payment_ids) ? (billing.previous_payment_ids as string[]) : []
  const previousIds = previousPaymentId ? [...history, previousPaymentId] : history

  const { error: updateErr } = await supabase
    .from('service_billings')
    .update({ payment_portone_id: paymentId, payment_url: paymentUrl, previous_payment_ids: previousIds })
    .eq('id', billing.id)
  if (updateErr) return { ok: false, status: 500, error: `DB 저장 실패: ${updateErr.message}` }

  return { ok: true, paymentId, paymentUrl, previousPaymentId, vbankCancelled: cancelled, note }
}

/** 옛 결제 ID가 '가상계좌 발급' 상태면 포트원에 취소 요청. 이미 결제됐으면 초기화를 막는다. */
async function cancelIssuedVirtualAccount(paymentId: string): Promise<{ cancelled: boolean; note: string | null }> {
  const client = getPortOneClient()
  if (!client) return { cancelled: false, note: '포트원 미설정 — 기존 가상계좌는 그대로 남아 있습니다' }
  try {
    const payment = await client.payment.getPayment({ paymentId }) as { status?: string }
    const status = String(payment.status ?? '')
    if (status === 'PAID') throw new Error('기존 결제 ID로 이미 입금/결제가 완료되었습니다. 결제 상태를 먼저 확인하세요.')
    if (status !== 'VIRTUAL_ACCOUNT_ISSUED') return { cancelled: false, note: null }
    await client.payment.cancelPayment({ paymentId, reason: '관리자 결제 ID 초기화 — 미입금 가상계좌 발급 취소' })
    return { cancelled: true, note: null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('이미 입금/결제가 완료')) throw e
    // 포트원에 없는 ID(아직 결제창을 한 번도 안 연 경우)거나 PG가 발급 취소를 지원하지 않는 경우 → 이력만 남기고 진행
    return { cancelled: false, note: `기존 가상계좌 취소 실패(${msg.slice(0, 80)}) — 입금 기한(7일)까지는 옛 계좌로도 입금될 수 있습니다` }
  }
}
