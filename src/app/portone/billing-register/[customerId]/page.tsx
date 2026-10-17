/**
 * 빌링키 등록 페이지 (고객용) — 서버 컴포넌트 (2026-10-18 Phase I.2)
 *
 * 역할:
 *   SMS 로 전송된 URL (`/customer/billing-register/{customerId}?t={token}`) 으로 고객 접속.
 *   서버 컴포넌트에서 customers 조회 + 토큰 검증 → 통과 시 클라이언트 컴포넌트에 데이터 전달.
 *
 * 보안:
 *   - URL 의 `?t=` 쿼리와 customers.billing_card_url(토큰 저장용 재사용) 비교
 *   - 불일치 시 404 (링크 만료·재발급 안내)
 */

import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { BillingRegisterClient } from './BillingRegisterClient'

interface Props {
  params: Promise<{ customerId: string }>
  searchParams: Promise<{ t?: string }>
}

export const metadata = {
  title: 'BBK 공간케어 · 매월 자동결제 카드 등록',
}

export default async function BillingRegisterPage({ params, searchParams }: Props) {
  const [{ customerId }, sp] = await Promise.all([params, searchParams])
  const token = sp.t
  if (!token) notFound()

  const supabase = createServiceClient()
  const { data: customer } = await supabase
    .from('customers')
    .select('id, business_name, contact_name, contact_phone, email, billing_card_url, billing_key_status, billing_amount, billing_monthly_amount, payment_date')
    .eq('id', customerId)
    .maybeSingle()

  if (!customer) notFound()
  if (customer.billing_card_url !== token) notFound()  // 토큰 불일치 → 404

  const isAlreadyActive = customer.billing_key_status === 'active'

  // 월정액 추정 (billing_monthly_amount 우선, fallback billing_amount)
  const monthlyAmount = Number(
    customer.billing_monthly_amount ?? customer.billing_amount ?? 0,
  )

  return (
    <BillingRegisterClient
      customer={{
        id: customer.id as string,
        businessName: (customer.business_name as string) ?? '-',
        ownerName: (customer.contact_name as string) ?? '-',
        phone: (customer.contact_phone as string) ?? '',
        email: (customer.email as string | null) ?? null,
        monthlyAmount,
        paymentDate: (customer.payment_date as number | null) ?? null,
      }}
      isAlreadyActive={isAlreadyActive}
    />
  )
}
