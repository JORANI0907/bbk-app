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

export interface PaidInfo {
  method: PaidMethod | null
  /** 실제 결제(입금)된 금액. 조회 실패 시 null */
  amount: number | null
}

/**
 * paymentId 로 포트원에 조회해 수단 + 실제 결제 금액을 돌려준다. 실패하면 둘 다 null.
 *   2026-11-03: 관리자 결제완료 문자·Slack 이 신청서의 잔금 칸(0원일 수 있음)을 읽어 "0원"으로 나가던 문제 →
 *   포트원이 기록한 실제 금액을 쓰도록 amount 추가.
 */
export async function fetchPaidInfo(paymentId: string): Promise<PaidInfo> {
  try {
    const client = getPortOneClient()
    if (!client || !paymentId) return { method: null, amount: null }
    const payment = await client.payment.getPayment({ paymentId }) as { amount?: { paid?: number; total?: number } }
    const paid = Number(payment.amount?.paid ?? payment.amount?.total ?? NaN)
    return { method: paymentMethodFromPortOne(payment), amount: Number.isFinite(paid) && paid > 0 ? paid : null }
  } catch (e) {
    console.error('[portone-method] 결제 정보 조회 실패:', paymentId, e instanceof Error ? e.message : e)
    return { method: null, amount: null }
  }
}

/** paymentId 로 포트원에 조회해 수단 판별. 실패하면 null (호출부는 기존 값 유지) */
export async function fetchPaidMethod(paymentId: string): Promise<PaidMethod | null> {
  return (await fetchPaidInfo(paymentId)).method
}
