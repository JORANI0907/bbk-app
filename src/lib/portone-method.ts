/**
 * 포트원 결제 정보 → BBK 결제수단 값 변환 (2026-11-01)
 *
 * 예약금·잔금이 서로 다른 수단으로 결제될 수 있어, 결제 완료 시점에 실제 수단을 읽어
 * service_applications / customers 의 deposit_payment_method · balance_payment_method 에 기록한다.
 */

import { getPortOneClient } from '@/lib/portone'

export type PaidMethod = 'credit_card' | 'virtual_account' | 'bank_transfer'

/** PortOne V2 payment 객체의 method.type 으로 수단 판별 */
export function paymentMethodFromPortOne(payment: unknown): PaidMethod | null {
  const method = (payment as { method?: { type?: string } } | null)?.method
  const type = String(method?.type ?? '')
  if (!type) return null
  if (type.includes('VirtualAccount')) return 'virtual_account'
  if (type.includes('Transfer')) return 'bank_transfer'
  // 카드 · 간편결제(카드 기반) · 모바일 등은 카드 계열로 본다
  if (type.includes('Card') || type.includes('EasyPay') || type.includes('Mobile')) return 'credit_card'
  return null
}

/** paymentId 로 포트원에 조회해 수단 판별. 실패하면 null (호출부는 기존 값 유지) */
export async function fetchPaidMethod(paymentId: string): Promise<PaidMethod | null> {
  try {
    const client = getPortOneClient()
    if (!client || !paymentId) return null
    const payment = await client.payment.getPayment({ paymentId })
    return paymentMethodFromPortOne(payment)
  } catch {
    return null
  }
}
