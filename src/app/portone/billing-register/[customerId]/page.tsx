/**
 * 자동결제 카드 등록 페이지 (고객용) — 서버 컴포넌트 (2026-10-18 Phase I.2)
 *
 * 역할:
 *   SMS 로 전송된 URL (`/portone/billing-register/{customerId}?t={token}`) 으로 고객 접속.
 *   서버 컴포넌트에서 customers 조회 + 토큰 검증 → 통과 시 클라이언트 컴포넌트에 데이터 전달.
 *
 * 보안:
 *   - URL 의 `?t=` 쿼리와 customers.billing_card_url(토큰 저장용 재사용) 비교
 *   - 불일치 시 404 (링크 만료·재발급 안내)
 *   - 이미 등록 완료(active)면 토큰이 소각돼 있으므로, 그 경우엔 토큰 없이도 완료 화면만 보여준다
 *
 * 2026-11-01: 결제수단·결제 기준·주기·카드명을 함께 전달 (공급가액/부가세 표기, 결제 시점 문구)
 */

import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { BillingRegisterClient } from './BillingRegisterClient'

interface Props {
  params: Promise<{ customerId: string }>
  searchParams: Promise<{ t?: string }>
}

export const metadata = {
  title: 'BBK 공간케어 · 자동결제 카드 등록',
}

export default async function BillingRegisterPage({ params, searchParams }: Props) {
  const [{ customerId }, sp] = await Promise.all([params, searchParams])
  const token = sp.t

  const supabase = createServiceClient()
  const { data: customer } = await supabase
    .from('customers')
    .select('id, business_name, contact_name, contact_phone, email, billing_card_url, billing_key_status, billing_key_card_name, billing_key_issued_at, billing_amount, billing_monthly_amount, payment_date, customer_type, billing_trigger, billing_cycle, payment_method')
    .eq('id', customerId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!customer) notFound()

  const isAlreadyActive = customer.billing_key_status === 'active'
  // 등록 전엔 토큰이 반드시 일치해야 한다. 등록 완료 후엔 토큰이 소각되므로 완료 화면만 허용.
  if (!isAlreadyActive && (!token || customer.billing_card_url !== token)) notFound()

  const amount = Number(customer.billing_monthly_amount ?? customer.billing_amount ?? 0)

  return (
    <BillingRegisterClient
      customer={{
        id: customer.id as string,
        businessName: (customer.business_name as string) ?? '-',
        ownerName: (customer.contact_name as string) ?? '-',
        phone: (customer.contact_phone as string) ?? '',
        email: (customer.email as string | null) ?? null,
        customerType: (customer.customer_type as string | null) ?? null,
        amount,
        paymentDate: (customer.payment_date as number | null) ?? null,
        billingTrigger: (customer.billing_trigger as string | null) ?? null,
        billingCycle: (customer.billing_cycle as string | null) ?? null,
        paymentMethod: (customer.payment_method as string | null) ?? null,
        cardName: (customer.billing_key_card_name as string | null) ?? null,
        issuedAt: (customer.billing_key_issued_at as string | null) ?? null,
      }}
      isAlreadyActive={isAlreadyActive}
      token={token ?? ''}
    />
  )
}
