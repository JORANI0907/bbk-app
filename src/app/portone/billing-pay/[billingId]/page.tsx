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
import { getServerSession } from '@/lib/session'

// 관리자 세션(쿠키)을 읽어 미리보기 모드를 판별하므로 항상 요청 시점에 렌더링
export const dynamic = 'force-dynamic'
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

  // 2026-11-03: 관리자·직원이 로그인한 브라우저에서 열면 미리보기 모드 — 결제창을 실제로 열지 않는다.
  //   (관리자가 고객 링크로 가상계좌를 발급해 버리면 결제 ID가 소진돼 고객이 다른 방법을 못 고르는 사고 방지)
  const session = getServerSession()
  const adminPreview = !!session && session.role !== 'customer'

  let customer: BillingPayCustomer = {
    id: null, businessName: '-', ownerName: '-', phone: '', email: null,
    customerType: null, billingKeyStatus: 'none', paymentDate: null, paymentMethod: null,
  }
  if (billing.customer_id) {
    const { data: cust } = await supabase
      .from('customers')
      .select('id, business_name, contact_name, contact_phone, email, customer_type, billing_key_status, payment_date, billing_trigger, payment_method')
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
        paymentMethod: (cust.payment_method as string | null) ?? null,
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
      adminPreview={adminPreview}
    />
  )
}
