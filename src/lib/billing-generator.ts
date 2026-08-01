/**
 * Phase 22 v11: 정기딥/정기엔드 계약 기반 청구(billings) 자동 생성 유틸리티.
 * 계약 저장 훅(customers POST/PATCH), cron 안전망, 방문 완료 트리거 모두 이 함수 재사용.
 *
 * 트리거 원칙:
 * - 정기딥 연간 / 정기엔드 연간: 계약 시 1건 (annual)
 * - 정기엔드 월간: 계약기간만큼 매월 1건씩 (monthly)
 * - 정기딥 월간: 여기서는 생성 안 함 — 방문 완료 이벤트 트리거로 별도 처리
 */

export interface GeneratedBilling {
  billing_type: 'monthly' | 'annual'
  billing_period: string
  due_date: string
  amount: number
}

export interface GenerateInput {
  customerType: string | null
  billingCycle: string | null
  contractStartDate: string | null
  contractEndDate: string | null
  paymentDay: number | null // customers.payment_date (1~31)
  billingAmount: number | null // 월/연 청구액 (부가세 포함)
}

/**
 * 이 계약이 billings 자동 생성 대상인지 판별
 */
export function shouldAutoGenerateBillings(input: GenerateInput): boolean {
  if (!input.customerType || !input.billingCycle) return false
  if (!input.contractStartDate) return false
  if (!input.billingAmount || input.billingAmount <= 0) return false

  // 지원 대상: 정기딥 월간/연간, 정기엔드 월간/연간
  if (input.customerType === '정기딥케어') return true
  if (input.customerType === '정기엔드케어') return true

  return false
}

/**
 * 계약 기간 전체에 대해 billings 레코드 목록 생성 (idempotent — 저장 전 existing과 비교해서 diff만 insert)
 */
export function generateBillingSchedule(input: GenerateInput): GeneratedBilling[] {
  if (!shouldAutoGenerateBillings(input)) return []

  const start = new Date(input.contractStartDate!)
  const end = input.contractEndDate ? new Date(input.contractEndDate) : new Date()
  const amount = input.billingAmount!
  const day = input.paymentDay ?? 25

  const results: GeneratedBilling[] = []
  const isAnnual = input.billingCycle === '연간'

  if (isAnnual) {
    // Phase 22 v12: 선결제 원칙 — 각 연도의 시작일(첫 해는 계약 시작일)이 due_date
    const startYear = start.getFullYear()
    const endYear = end.getFullYear()
    for (let y = startYear; y <= endYear; y++) {
      const dueDate = y === startYear
        ? input.contractStartDate!.slice(0, 10)
        : `${y}-01-01`
      results.push({ billing_type: 'annual', billing_period: String(y), due_date: dueDate, amount })
    }
  } else {
    // 월간: 시작월부터 종료월까지
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
    const endCursor = new Date(end.getFullYear(), end.getMonth(), 1)
    while (cursor <= endCursor) {
      const y = cursor.getFullYear()
      const m = cursor.getMonth() + 1
      const period = `${y}-${String(m).padStart(2, '0')}`
      const lastDay = new Date(y, m, 0).getDate()
      const dueDay = Math.min(day, lastDay)
      const dueDate = `${y}-${String(m).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`
      results.push({ billing_type: 'monthly', billing_period: period, due_date: dueDate, amount })
      cursor.setMonth(cursor.getMonth() + 1)
    }
  }

  return results
}

/**
 * 특정 날짜 기준 월간 billing_period 문자열 (예: 2026-07)
 */
export function toMonthlyPeriod(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * 정기딥 월간: 특정 방문 날짜가 속한 달의 due_date 계산.
 * customer.payment_date가 있으면 그 일자, 없으면 월말.
 */
export function calcMonthlyDueDate(visitDate: string | Date, paymentDay: number | null): string {
  const d = typeof visitDate === 'string' ? new Date(visitDate) : visitDate
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const lastDay = new Date(y, m, 0).getDate()
  const day = paymentDay ? Math.min(paymentDay, lastDay) : lastDay
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * customers row에서 billingAmount 계산 (supply + vat 우선, 없으면 billing_amount 필드 사용).
 * 비과세 결제방법이면 vat 제외.
 */
export function computeBillingAmountFromCustomer(customer: {
  supply_amount?: number | null
  vat?: number | null
  billing_amount?: number | null
  payment_method?: string | null
}): number | null {
  const NO_VAT_METHODS = new Set(['현금(비과세)', '카드(온라인 간편결제)', '플랫폼'])
  const noVat = NO_VAT_METHODS.has(customer.payment_method ?? '')
  const s = Number(customer.supply_amount ?? 0)
  const v = noVat ? 0 : Number(customer.vat ?? 0)
  if (s > 0) return s + v
  if (customer.billing_amount) return Number(customer.billing_amount)
  return null
}
