/**
 * 정기 결제 전용 페이지 (2026-10-18 Phase H.6)
 *
 * 설계 범위:
 *   service_billings 1건에 대한 결제 안내 + 결제 플로우.
 *   가상계좌 발급 중심 (사장님 수금 추적에 가장 깔끔).
 *   issue-billing-link API 로 payment_portone_id 가 선 발급된 상태 → 그 ID로 PortOne requestPayment 호출.
 *
 * 서버 컴포넌트에서 service_billings + customers 조회 후 클라이언트 컴포넌트에 전달.
 */

import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { BillingPayClient } from './BillingPayClient'

interface Props {
  params: Promise<{ billingId: string }>
}

export const metadata = {
  title: 'BBK 공간케어 · 정기 결제',
}

export default async function BillingPayPage({ params }: Props) {
  const { billingId } = await params
  const supabase = createServiceClient()

  // service_billings 조회
  const { data: billing } = await supabase
    .from('service_billings')
    .select('id, customer_id, billing_type, billing_period, amount, due_date, paid_date, status, payment_url, payment_portone_id')
    .eq('id', billingId)
    .maybeSingle()

  if (!billing) notFound()

  // customers 조회 (연락처·업체명 등)
  let customer: {
    id: string | null
    businessName: string
    ownerName: string
    phone: string
    email: string | null
  } = {
    id: null, businessName: '-', ownerName: '-', phone: '', email: null,
  }
  if (billing.customer_id) {
    const { data: cust } = await supabase
      .from('customers')
      .select('id, business_name, contact_name, contact_phone, contact_email')
      .eq('id', billing.customer_id)
      .maybeSingle()
    if (cust) {
      customer = {
        id: cust.id as string,
        businessName: (cust.business_name as string) ?? '-',
        ownerName: (cust.contact_name as string) ?? '-',
        phone: (cust.contact_phone as string) ?? '',
        email: (cust.contact_email as string | null) ?? null,
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
