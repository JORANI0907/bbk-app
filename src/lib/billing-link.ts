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
