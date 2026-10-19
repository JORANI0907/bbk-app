/**
 * BBK 청구(service_billings) 자동 생성 유틸리티
 *
 * 원칙:
 * - 정기케어(딥/엔드) 모두 billing_cycle(월간/2개월/3개월/연간)만으로 청구 스케줄 계산
 * - 유형별(딥/엔드) 분기 없음
 * - 비과세 여부는 payment_method로 자동 판별 (src/lib/payment-methods.ts hasVat() 사용)
 * - idempotent: 기존 billing_period는 스킵 (중복 방지)
 *
 * 트리거:
 * 1. 고객 저장(PATCH) 시 autoGenerateBillings 자동 호출
 * 2. Cron 안전망 (/api/cron/billings-safety-net)
 */

import { hasVat } from '@/lib/payment-methods'

/** billing_cycle 문자열 → 한 주기당 월 수 ('월간'→1, 'N개월'→N, '연간'→12) */
export function billingCycleStepMonths(cycle: string | null): number {
  if (!cycle || cycle === '월간') return 1
  if (cycle === '연간') return 12
  const m = cycle.match(/^(\d+)개월$/)
  return m ? parseInt(m[1], 10) : 1
}

export type BillingTiming = 'prepaid' | 'postpaid'

export interface GeneratedBilling {
  billing_type:    'monthly' | 'annual' | 'onetime'
  billing_period:  string   // 월간: '2026-04', 연간: '2026', 1회성: '2026-08-01'
  due_date:        string   // YYYY-MM-DD
  amount:          number
  service_type?:   string   // 결과에 포함 (DB INSERT 시 활용)
  billing_timing?: BillingTiming
}

export interface GenerateInput {
  serviceType:       string | null  // '정기딥케어' | '정기엔드케어' | '1회성케어'
  billingCycle:      string | null  // '월간' | '연간'
  contractStartDate: string | null  // YYYY-MM-DD
  contractEndDate:   string | null  // YYYY-MM-DD
  paymentDay:        number | null  // 결제일 (1~31, 선납일 때만 사용)
  billingAmount:     number | null  // 청구액 (부가세 포함)
  billingTiming?:    BillingTiming  // 'prepaid'(선납) | 'postpaid'(후납), 기본 'prepaid'
  // 2026-10-19: 사장님이 모달에서 설정한 생성 범위 (계약기간보다 우선)
  //   계약기간은 "재계약 주기" 참고용. 결제는 이 범위대로 생성.
  //   둘 다 'YYYY-MM' 형식. 연간은 년도만 사용.
  fromPeriod?:       string
  toPeriod?:         string
}

/** 목표 월 말일로 clamp 하면서 개월 수 더하기 (JS Date 오버플로우 방지) */
function addMonthsClamped(base: Date, months: number): Date {
  const y = base.getFullYear()
  const m = base.getMonth() + months
  const targetY = y + Math.floor(m / 12)
  const targetM = ((m % 12) + 12) % 12
  const targetLastDay = new Date(targetY, targetM + 1, 0).getDate()
  const targetDay = Math.min(base.getDate(), targetLastDay)
  return new Date(targetY, targetM, targetDay)
}

function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * K번째(1-based) 사이클의 후납 due_date 계산
 * = 계약 시작일 + K사이클 - 1일 (사이클 종료일 = 다음 사이클 전일)
 * 예: start=2026-07-18, K=1, step=1  →  2026-08-17
 *     start=2026-01-31, K=1, step=1  →  2026-02-27 (2월 말일 clamp)
 */
function computePostpaidDueDate(start: Date, cycleIdx: number, stepMonths: number): string {
  const next = addMonthsClamped(start, cycleIdx * stepMonths)
  next.setDate(next.getDate() - 1)
  return toISODate(next)
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
 *
 * 선납(prepaid): 사이클 시작월의 payment_day 가 due_date
 * 후납(postpaid): 사이클 종료일(= 다음 사이클 시작 전일)이 due_date
 *   예) 계약 2026-07-18 · 월간 후납 → 첫 due_date = 2026-08-17
 */
export function generateBillingSchedule(input: GenerateInput): GeneratedBilling[] {
  if (!shouldAutoGenerateBillings(input)) return []

  const start  = new Date(input.contractStartDate!)
  const end    = input.contractEndDate ? new Date(input.contractEndDate) : new Date()
  const amount = input.billingAmount!
  // 결제일자 비어있으면 계약일의 일을 기본값으로 (기존: 하드코딩 25일)
  const day    = input.paymentDay ?? start.getDate()
  const sType  = input.serviceType ?? undefined
  const timing: BillingTiming = input.billingTiming ?? 'prepaid'

  const results: GeneratedBilling[] = []
  const isAnnual = input.billingCycle === '연간'
  const stepMonths = billingCycleStepMonths(input.billingCycle)

  // 2026-10-19: 사장님 로직 — "계약기간은 재계약 주기 참고용", 결제는 모달 범위(toPeriod)대로 생성.
  //   끝점(endLimit): toPeriod 있으면 그 월(연간은 그 년), 없으면 계약종료, 없으면 오늘+12개월(월간) / +10년(연간)
  //   시작 필터(fromPeriod): 그 이전은 skip (단 cycleIdx는 유지 — 결제일자 리듬 정렬)
  const fromMonth: string | null = input.fromPeriod ?? null
  const fromYear: string | null = input.fromPeriod ? input.fromPeriod.slice(0, 4) : null

  if (isAnnual) {
    const stepMonths = 12
    // 끝점: toPeriod 있으면 그 년도 말일, 없으면 계약종료, 없으면 오늘+10년
    let endLimit: Date
    if (input.toPeriod) {
      const toYear = parseInt(input.toPeriod.slice(0, 4), 10)
      endLimit = new Date(toYear, 11, 31)
    } else if (input.contractEndDate) {
      endLimit = end
    } else {
      const now = new Date()
      endLimit = new Date(now.getFullYear() + 10, 11, 31)
    }

    let cycleIdx = 0
    while (true) {
      cycleIdx++
      const cycleStart = cycleIdx === 1 ? start : addMonthsClamped(start, (cycleIdx - 1) * stepMonths)
      if (cycleStart > endLimit) break
      const cycleYear = String(cycleStart.getFullYear())
      if (fromYear && cycleYear < fromYear) continue
      const dueDate = timing === 'postpaid'
        ? computePostpaidDueDate(start, cycleIdx, stepMonths)
        : toISODate(cycleStart)
      results.push({
        billing_type: 'annual',
        billing_period: cycleYear,
        due_date: dueDate,
        amount,
        service_type: sType,
        billing_timing: timing,
      })
    }
  } else {
    // 월간 / 2개월 / 3개월: stepMonths 간격으로 1건
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
    // 끝점: toPeriod 있으면 그 월, 없으면 계약종료월, 없으면 오늘+12개월
    let endCursor: Date
    if (input.toPeriod) {
      const [ey, em] = input.toPeriod.split('-').map(Number)
      endCursor = new Date(ey, em - 1, 1)
    } else if (input.contractEndDate) {
      endCursor = new Date(end.getFullYear(), end.getMonth(), 1)
    } else {
      const now = new Date()
      endCursor = new Date(now.getFullYear(), now.getMonth() + 12, 1)
    }

    let cycleIdx = 0
    while (cursor <= endCursor) {
      cycleIdx++
      const y = cursor.getFullYear()
      const m = cursor.getMonth() + 1
      const period = `${y}-${String(m).padStart(2, '0')}`

      // fromPeriod 이전은 skip (cycleIdx 는 유지 — 사이클 번호 일관성)
      if (fromMonth && period < fromMonth) {
        cursor.setMonth(cursor.getMonth() + stepMonths)
        continue
      }

      let dueDate: string
      if (timing === 'postpaid') {
        if (input.paymentDay) {
          const nextMonthIdx = cursor.getMonth() + stepMonths      // 0-based
          const nextY = cursor.getFullYear() + Math.floor(nextMonthIdx / 12)
          const nextM = (((nextMonthIdx % 12) + 12) % 12) + 1       // 1-based
          const lastDay = new Date(nextY, nextM, 0).getDate()
          const dueDay  = Math.min(input.paymentDay, lastDay)
          dueDate = `${nextY}-${String(nextM).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`
        } else {
          dueDate = computePostpaidDueDate(start, cycleIdx, stepMonths)
        }
      } else {
        const lastDay = new Date(y, m, 0).getDate()
        const dueDay  = Math.min(day, lastDay)
        dueDate = `${y}-${String(m).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`
      }

      results.push({
        billing_type: 'monthly',
        billing_period: period,
        due_date: dueDate,
        amount,
        service_type: sType,
        billing_timing: timing,
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

/**
 * customers row에서 청구액 계산.
 *   billing_amount(마스터 UI에서 결제방법·부가세 반영해 산정된 최종 총액)를 최우선 반환.
 *   billing_amount 가 없을 때만 supply + vat fallback 계산.
 *
 *   과거 버전은 supply + vat 을 먼저 계산했는데, NO_VAT_METHODS 에 '카드(온라인 간편결제)'·
 *   '플랫폼' 이 포함되어 있어 카드 결제 시 부가세를 뺀 공급가액만 저장되는 문제 발생.
 *   (예: 신전떡볶이 마스터 198,000 → 청구서 amount 180,000 으로 저장됨)
 *
 *   2026-10-06 재설계: NO_VAT_METHODS 하드코딩 제거, src/lib/payment-methods.ts의
 *   hasVat() 사용으로 전환. 레거시+신규 enum 둘 다 자동 처리.
 */
export function computeBillingAmountFromCustomer(customer: {
  supply_amount?:  number | null
  vat?:            number | null
  billing_amount?: number | null
  payment_method?: string | null
}): number | null {
  if (customer.billing_amount) return Number(customer.billing_amount)
  const noVat = !hasVat(customer.payment_method)
  const s = Number(customer.supply_amount ?? 0)
  const v = noVat ? 0 : Number(customer.vat ?? 0)
  if (s > 0) return s + v
  return null
}
