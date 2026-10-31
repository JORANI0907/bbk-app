/**
 * 정기 결제 페이지 (2026-10-18 Phase H.6 → 2026-11-01 결제수단 3종으로 확장)
 *
 * service_billings 1건에 대한 결제 안내 + 결제 플로우.
 *   ① 카드 결제  ② 계좌이체(가상계좌)  ③ 카드 자동결제 등록(이번 건 결제 + 다음부터 자동)
 * issue-billing-link(lib/billing-link) 로 payment_portone_id 가 선 발급된 상태 → 그 ID로 PortOne 호출.
 *
 * 서버 컴포넌트에서 service_billings + customers 조회 후 클라이언트 컴포넌트에 전달.
 */

import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { BillingPayClient, type BillingPayCustomer } from './BillingPayClient'

interface Props {
  params: Promise<{ billingId: string }>
}

export const metadata = {
  title: 'BBK 공간케어 · 정기 결제',
}

export default async function BillingPayPage({ params }: Props) {
  const { billingId } = await params
  const supabase = createServiceClient()

  const { data: billing } = await supabase
    .from('service_billings')
    .select('id, customer_id, billing_type, billing_period, amount, due_date, paid_date, status, payment_url, payment_portone_id')
    .eq('id', billingId)
    .maybeSingle()

  if (!billing) notFound()

  let customer: BillingPayCustomer = {
    id: null, businessName: '-', ownerName: '-', phone: '', email: null,
    customerType: null, billingKeyStatus: 'none', paymentDate: null,
  }
  if (billing.customer_id) {
    const { data: cust } = await supabase
      .from('customers')
      .select('id, business_name, contact_name, contact_phone, email, customer_type, billing_key_status, payment_date, billing_trigger')
      .eq('id', billing.customer_id)
      .maybeSingle()
    if (cust) {
      customer = {
        id: cust.id as string,
        businessName: (cust.business_name as string) ?? '-',
        ownerName: (cust.contact_name as string) ?? '-',
        phone: (cust.contact_phone as string) ?? '',
        email: (cust.email as string | null) ?? null,
        customerType: (cust.customer_type as string | null) ?? null,
        billingKeyStatus: (cust.billing_key_status as string | null) ?? 'none',
        paymentDate: cust.billing_trigger === 'per_visit' ? null : ((cust.payment_date as number | null) ?? null),
      }
    }
  }

  return (
    <BillingPayClient
      billing={{
        id: billing.id,
        billingType: (billing.billing_type as string) ?? 'monthly',
        billingPeriod: (billing.billing_period as string) ?? '',
        amount: Number(billing.amount ?? 0),
        dueDate: (billing.due_date as string) ?? '',
        paidDate: (billing.paid_date as string | null) ?? null,
        status: (billing.status as string) ?? 'pending',
        paymentPortoneId: (billing.payment_portone_id as string | null) ?? null,
      }}
      customer={customer}
    />
  )
}
