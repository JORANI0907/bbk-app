// 정기(딥/엔드) 월 결제 안내 SMS — 자동(cron)·수동(고객관리 버튼) 공용 (2026-10-29)
//
// 문자알림관리의 '정기결제알림' 템플릿을 고르고, 청구(service_billings) 1건으로 변수를 채운다.
// 자동/수동이 같은 템플릿·같은 변수를 쓰도록 이 파일 하나에서만 결정한다.

import type { NotificationContext } from './notification-variables'
import { normalizePaymentMethod } from './payment-methods'

export interface RecurringBillingCustomer {
  business_name: string | null
  contact_name: string | null
  contact_phone: string | null
  customer_type: string | null
  payment_method: string | null
  account_number: string | null
}

export interface RecurringBillingRow {
  amount: number | null
  due_date: string | null
  payment_url?: string | null
}

/** 카드 고객 → 정기결제알림(카드)_*, 그 외 → 정기결제알림_* */
export function pickRecurringBillingTemplate(customerType: string | null, paymentMethod: string | null): string {
  const suffix = customerType === '정기딥케어' ? '_정기딥' : '_정기엔드'
  // 레거시 한글('카드(온라인 간편결제)')·신규 영문('credit_card') 모두 카드로 인식
  const isCard = normalizePaymentMethod(paymentMethod) === 'credit_card'
  return isCard ? `정기결제알림(카드)${suffix}` : `정기결제알림${suffix}`
}

export function buildRecurringBillingContext(
  cust: RecurringBillingCustomer,
  row: RecurringBillingRow,
): NotificationContext {
  return {
    customer: {
      business_name: cust.business_name,
      contact_name: cust.contact_name,
      contact_phone: cust.contact_phone,
      payment_method: cust.payment_method,
      account_number: cust.account_number,
      billing_amount: row.amount,          // {{계약금액}} 소스
      billing_next_date: row.due_date,     // {{다음결제일}} 소스
      balance_payment_url: row.payment_url ?? null, // {{잔금결제URL}} 소스 — 이번 달 청구 결제링크
    },
  }
}
