/**
 * BBK 청구(service_billings) 자동 생성 유틸리티
 *
 * 원칙:
 * - 정기케어(딥/엔드) 모두 billing_cycle(월간/2개월/3개월/연간)만으로 청구 스케줄 계산
 * - 유형별(딥/엔드) 분기 없음
 * - 비과세 여부는 payment_method로 자동 판별
 * - idempotent: 기존 billing_period는 스킵 (중복 방지)
 *
 * 트리거:
 * 1. 고객 저장(PATCH) 시 autoGenerateBillings 자동 호출
 * 2. Cron 안전망 (/api/cron/billings-safety-net)
 */

/** billing_cycle 문자열 → 한 주기당 월 수 ('월간'→1, 'N개월'→N, '연간'→12) */
export function billingCycleStepMonths(cycle: string | null): number {
  if (!cycle || cycle === '월간') return 1
  if (cycle === '연간') return 12
  const m = cycle.match(/^(\d+)개월$/)
  return m ? parseInt(m[1], 10) : 1
}

export interface GeneratedBilling {
  billing_type:   'monthly' | 'annual' | 'onetime'
  billing_period: string   // 월간: '2026-04', 연간: '2026', 1회성: '2026-08-01'
  due_date:       string   // YYYY-MM-DD
  amount:         number
  service_type?:  string   // 결과에 포함 (DB INSERT 시 활용)
}

export interface GenerateInput {
  serviceType:       string | null  // '정기딥케어' | '정기엔드케어' | '1회성케어'
  billingCycle:      string | null  // '월간' | '연간'
  contractStartDate: string | null  // YYYY-MM-DD
  contractEndDate:   string | null  // YYYY-MM-DD
  paymentDay:        number | null  // 결제일 (1~31)
  billingAmount:     number | null  // 청구액 (부가세 포함)
}

const REGULAR_TYPES = new Set(['정기딥케어', '정기엔드케어'])

/**
 * 이 계약이 billings 자동 생성 대상인지 판별
 */
export function shouldAutoGenerateBillings(input: GenerateInput): boolean {
  if (!REGULAR_TYPES.has(input.serviceType ?? '')) return false
  if (!input.billingCycle) return false
  if (!input.contractStartDate) return false
  if (!input.billingAmount || input.billingAmount <= 0) return false
  return true
}

/**
 * 계약 기간 전체에 대해 billings 레코드 목록 생성
 */
export function generateBillingSchedule(input: GenerateInput): GeneratedBilling[] {
  if (!shouldAutoGenerateBillings(input)) return []

  const start  = new Date(input.contractStartDate!)
  const end    = input.contractEndDate ? new Date(input.contractEndDate) : new Date()
  const amount = input.billingAmount!
  const day    = input.paymentDay ?? 25
  const sType  = input.serviceType ?? undefined

  const results: GeneratedBilling[] = []
  const isAnnual = input.billingCycle === '연간'
  const stepMonths = billingCycleStepMonths(input.billingCycle)

  if (isAnnual) {
    // 연간: 각 연도별 1건 / 첫 해 due_date=계약시작일, 이후 1월1일
    const startYear = start.getFullYear()
    const endYear   = end.getFullYear()
    for (let y = startYear; y <= endYear; y++) {
      const dueDate = y === startYear
        ? input.contractStartDate!.slice(0, 10)
        : `${y}-01-01`
      results.push({
        billing_type: 'annual',
        billing_period: String(y),
        due_date: dueDate,
        amount,
        service_type: sType,
      })
    }
  } else {
    // 월간 / 2개월 / 3개월: stepMonths 간격으로 payment_day에 1건
    const cursor    = new Date(start.getFullYear(), start.getMonth(), 1)
    const endCursor = new Date(end.getFullYear(), end.getMonth(), 1)
    while (cursor <= endCursor) {
      const y = cursor.getFullYear()
      const m = cursor.getMonth() + 1
      const period  = `${y}-${String(m).padStart(2, '0')}`
      const lastDay = new Date(y, m, 0).getDate()
      const dueDay  = Math.min(day, lastDay)
      const dueDate = `${y}-${String(m).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`
      results.push({
        billing_type: 'monthly',
        billing_period: period,
        due_date: dueDate,
        amount,
        service_type: sType,
      })
      cursor.setMonth(cursor.getMonth() + stepMonths)
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
 * 방문 날짜가 속한 달의 due_date 계산 (정기딥 월간 방문 완료 트리거용)
 */
export function calcMonthlyDueDate(visitDate: string | Date, paymentDay: number | null): string {
  const d = typeof visitDate === 'string' ? new Date(visitDate) : visitDate
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const lastDay = new Date(y, m, 0).getDate()
  const day = paymentDay ? Math.min(paymentDay, lastDay) : lastDay
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// 비과세 결제수단
const NO_VAT_METHODS = new Set(['현금(비과세)', '카드(온라인 간편결제)', '플랫폼'])

/**
 * customers row에서 청구액 계산 (supply + vat 우선, 없으면 billing_amount)
 */
export function computeBillingAmountFromCustomer(customer: {
  supply_amount?:  number | null
  vat?:            number | null
  billing_amount?: number | null
  payment_method?: string | null
}): number | null {
  const noVat = NO_VAT_METHODS.has(customer.payment_method ?? '')
  const s = Number(customer.supply_amount ?? 0)
  const v = noVat ? 0 : Number(customer.vat ?? 0)
  if (s > 0) return s + v
  if (customer.billing_amount) return Number(customer.billing_amount)
  return null
}
