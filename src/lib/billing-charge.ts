/**
 * 저장된 카드(빌링키)로 청구서 1장 즉시 결제 (2026-11-01)
 *
 * 쓰는 곳:
 *   - 결제 페이지에서 "카드 자동결제 등록" 직후 이번 청구서 결제
 *   - 정기 결제 안내 발송 직전: 빌링키 있는 고객은 문자 대신 바로 결제
 *   - cron/billing-auto-charge (매월 결제일 자동 출금)
 *
 * 성공 시 service_billings.status='paid' + customers.billing_last_billed_at 갱신 + Slack.
 * 실패 시 customers.payment_status_detail 에 사유 저장 (사장님 UI 노출).
 */

import { createServiceClient } from '@/lib/supabase/server'
import { getPortOneClient, getStoreId, isPortOneEnabled } from '@/lib/portone'
import { sendSlack } from '@/lib/slack'
import { todayKstIso } from '@/lib/billing-notify-policy'

type Supabase = ReturnType<typeof createServiceClient>

export type ChargeResult =
  | { ok: true; paymentId: string; alreadyPaid?: boolean }
  | { ok: false; reason: 'portone_disabled' | 'not_found' | 'no_billing_key' | 'zero_amount' | 'pg_failed'; message: string }

interface BillingRow {
  id: string
  customer_id: string | null
  amount: number | null
  status: string | null
  billing_type: string | null
  billing_period: string | null
  service_type: string | null
  payment_portone_id: string | null
}

interface CustomerRow {
  id: string
  business_name: string | null
  contact_name: string | null
  contact_phone: string | null
  billing_key: string | null
  billing_key_status: string | null
}

async function markPaid(supabase: Supabase, billing: BillingRow, customer: CustomerRow, paymentId: string) {
  await supabase
    .from('service_billings')
    .update({ status: 'paid', paid_date: todayKstIso(), payment_portone_id: paymentId })
    .eq('id', billing.id)
    .neq('status', 'paid')
  await supabase
    .from('customers')
    .update({ billing_last_billed_at: new Date().toISOString(), payment_status_detail: null })
    .eq('id', customer.id)

  const typeLabel = billing.billing_type === 'annual' ? '연간' : billing.billing_type === 'onetime' ? '추가' : '월간'
  sendSlack(
    `💳 *카드 자동결제 완료* (${billing.service_type ?? ''} · ${typeLabel})\n` +
    `업체: ${customer.business_name ?? '-'}\n` +
    `기간: ${billing.billing_period ?? '-'} · 금액: ${Number(billing.amount ?? 0).toLocaleString('ko-KR')}원\n` +
    `결제ID: ${paymentId}`,
  ).catch(() => {})
}

async function isPaidOnPortOne(paymentId: string): Promise<boolean> {
  try {
    const client = getPortOneClient()
    if (!client) return false
    const p = await client.payment.getPayment({ paymentId }) as { status?: string }
    return p.status === 'PAID'
  } catch {
    return false
  }
}

/** 청구서 1장을 고객의 빌링키로 결제. 멱등: 이미 paid 면 성공으로 돌려준다. */
export async function chargeBillingWithKey(supabase: Supabase, billingId: string): Promise<ChargeResult> {
  if (!isPortOneEnabled()) return { ok: false, reason: 'portone_disabled', message: '포트원 미설정' }

  const { data: billingRaw } = await supabase
    .from('service_billings')
    .select('id, customer_id, amount, status, billing_type, billing_period, service_type, payment_portone_id')
    .eq('id', billingId)
    .maybeSingle()
  const billing = billingRaw as BillingRow | null
  if (!billing || !billing.customer_id) return { ok: false, reason: 'not_found', message: '청구서를 찾을 수 없습니다' }
  if (billing.status === 'paid') return { ok: true, paymentId: String(billing.payment_portone_id ?? ''), alreadyPaid: true }

  const amount = Number(billing.amount ?? 0)
  if (amount <= 0) return { ok: false, reason: 'zero_amount', message: '결제 금액이 0원입니다' }

  const { data: custRaw } = await supabase
    .from('customers')
    .select('id, business_name, contact_name, contact_phone, billing_key, billing_key_status')
    .eq('id', billing.customer_id)
    .maybeSingle()
  const customer = custRaw as CustomerRow | null
  if (!customer?.billing_key || customer.billing_key_status !== 'active') {
    return { ok: false, reason: 'no_billing_key', message: '등록된 자동결제 카드가 없습니다' }
  }

  // 결제 ID: 기존 링크용 ID 가 있으면 그대로 (webhook 매칭 일관성), 없으면 자동결제용 새 ID
  const shortId = billing.id.replace(/-/g, '').slice(0, 8)
  const paymentId = billing.payment_portone_id ?? `bbk_autocharge_${shortId}_${Date.now()}`
  if (!billing.payment_portone_id) {
    await supabase.from('service_billings').update({ payment_portone_id: paymentId }).eq('id', billing.id)
  }

  try {
    const client = getPortOneClient()!
    const phone = (customer.contact_phone ?? '').replace(/-/g, '')
    await client.payment.payWithBillingKey({
      paymentId,
      storeId: getStoreId(),
      billingKey: customer.billing_key,
      orderName: `${customer.business_name ?? 'BBK 공간케어'} ${billing.billing_period ?? ''} 정기 결제`,
      amount: { total: amount },
      currency: 'KRW',
      customer: {
        name: { full: customer.contact_name ?? customer.business_name ?? '-' },
        ...(phone ? { phoneNumber: phone } : {}),
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // 타임아웃 등으로 에러가 났지만 실제로는 승인된 경우 → 상태 재조회 후 paid 처리
    if (await isPaidOnPortOne(paymentId)) {
      await markPaid(supabase, billing, customer, paymentId)
      return { ok: true, paymentId }
    }
    await supabase
      .from('customers')
      .update({ payment_status_detail: `자동결제 실패 (${todayKstIso()}): ${msg.slice(0, 200)}` })
      .eq('id', customer.id)
    return { ok: false, reason: 'pg_failed', message: msg }
  }

  await markPaid(supabase, billing, customer, paymentId)
  return { ok: true, paymentId }
}
