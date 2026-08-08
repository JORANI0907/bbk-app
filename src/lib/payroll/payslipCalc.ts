/**
 * 급여명세서 · 회계 리포트 공용 계산 로직
 * payslip-data API, export API, 향후 급여관리 화면 요약 카드가 모두 이 함수를 사용해
 * "PDF 명세서 = 엑셀 시트 = 화면 카드" 숫자 정합성을 보장한다.
 */

export type TaxType = '4대보험' | '2대보험' | '3대보험' | '프리랜서3.3%' | '없음'
export type SalaryBasis = '세전' | '세후'

// 2026년 기준 4대보험 근로자 부담 요율 (표준)
export const RATE_NATIONAL_PENSION = 0.045
export const RATE_HEALTH_INSURANCE = 0.03545
export const RATE_LONGTERM_CARE    = 0.1295
export const RATE_EMPLOYMENT       = 0.009
export const RATE_RESIDENT_TAX     = 0.1
export const RATE_FREELANCE_TAX    = 0.03
export const RATE_FREELANCE_RESIDENT = 0.003

export interface ExtraItem {
  label: string
  amount: number
}

export interface Deductions {
  nationalPension: number
  healthInsurance: number
  longtermCare: number
  employmentInsurance: number
  incomeTax: number
  residentTax: number
  businessTax: number
  total: number
}

export interface PayslipCalcInput {
  autoAmount: number                // 배정 자동 계산 금액
  finalAmount: number | null        // 관리자 조정 최종 지급액 (null이면 auto 사용)
  extraItems: ExtraItem[]           // 추가 지급 (상여금 등)
  extraDeductions: ExtraItem[]      // 추가 공제 (손망실 등)
  taxType: TaxType
  salaryBasis: SalaryBasis
  incomeTax: number                 // 근로소득세 (4대보험 인원만 유효)
}

export interface PayslipCalcResult {
  bookedAmount: number              // 관리자 책정 금액 (세전이면 gross, 세후면 net)
  basePay: number                   // 기본급 (추가 지급 항목 제외 · 세후일 땐 gross-up 반영)
  extraItemsTotal: number           // 추가 지급 항목 합계
  extraDeductionsTotal: number      // 추가 공제 항목 합계
  grossTotal: number                // 지급 총액 = basePay + extraItemsTotal
  deductions: Deductions            // 4대보험 · 사업소득세 등
  netPay: number                    // 실지급액 = grossTotal - deductions.total - extraDeductionsTotal
  isNetBasis: boolean
  isAdjusted: boolean               // 관리자 조정 여부
}

/**
 * 세후 방식일 때, 책정된 net 금액으로부터 총 지급액(gross)을 역산.
 * - 프리랜서3.3%: gross = net / (1 - 0.033)
 * - 4대보험: gross = (net + incomeTax × (1 + 지방세율)) / (1 - 총공제율)
 */
export function reverseGrossFromNet(net: number, taxType: TaxType, incomeTax: number): number {
  if (taxType === '프리랜서3.3%') {
    return Math.round(net / (1 - RATE_FREELANCE_TAX - RATE_FREELANCE_RESIDENT))
  }
  if (taxType === '4대보험') {
    const totalGrossRate =
      RATE_NATIONAL_PENSION +
      RATE_HEALTH_INSURANCE +
      RATE_HEALTH_INSURANCE * RATE_LONGTERM_CARE +
      RATE_EMPLOYMENT
    return Math.round((net + incomeTax * (1 + RATE_RESIDENT_TAX)) / (1 - totalGrossRate))
  }
  if (taxType === '3대보험') {
    const totalGrossRate =
      RATE_NATIONAL_PENSION +
      RATE_HEALTH_INSURANCE +
      RATE_HEALTH_INSURANCE * RATE_LONGTERM_CARE
    return Math.round((net + incomeTax * (1 + RATE_RESIDENT_TAX)) / (1 - totalGrossRate))
  }
  if (taxType === '2대보험') {
    const totalGrossRate =
      RATE_HEALTH_INSURANCE +
      RATE_HEALTH_INSURANCE * RATE_LONGTERM_CARE
    return Math.round((net + incomeTax * (1 + RATE_RESIDENT_TAX)) / (1 - totalGrossRate))
  }
  return net
}

/**
 * 지급총액(gross) 기준으로 세금 유형별 공제를 계산 (원단위 십원 절사).
 */
export function calculateDeductions(gross: number, taxType: TaxType, incomeTax: number): Deductions {
  if (taxType === '4대보험') {
    const nationalPension = Math.floor(gross * RATE_NATIONAL_PENSION / 10) * 10
    const healthInsurance = Math.floor(gross * RATE_HEALTH_INSURANCE / 10) * 10
    const longtermCare = Math.floor(healthInsurance * RATE_LONGTERM_CARE / 10) * 10
    const employmentInsurance = Math.floor(gross * RATE_EMPLOYMENT / 10) * 10
    const residentTax = Math.floor(incomeTax * RATE_RESIDENT_TAX / 10) * 10
    return {
      nationalPension,
      healthInsurance,
      longtermCare,
      employmentInsurance,
      incomeTax,
      residentTax,
      businessTax: 0,
      total: nationalPension + healthInsurance + longtermCare + employmentInsurance + incomeTax + residentTax,
    }
  }
  if (taxType === '3대보험') {
    const nationalPension = Math.floor(gross * RATE_NATIONAL_PENSION / 10) * 10
    const healthInsurance = Math.floor(gross * RATE_HEALTH_INSURANCE / 10) * 10
    const longtermCare = Math.floor(healthInsurance * RATE_LONGTERM_CARE / 10) * 10
    const residentTax = Math.floor(incomeTax * RATE_RESIDENT_TAX / 10) * 10
    return {
      nationalPension,
      healthInsurance,
      longtermCare,
      employmentInsurance: 0,
      incomeTax,
      residentTax,
      businessTax: 0,
      total: nationalPension + healthInsurance + longtermCare + incomeTax + residentTax,
    }
  }
  if (taxType === '2대보험') {
    const healthInsurance = Math.floor(gross * RATE_HEALTH_INSURANCE / 10) * 10
    const longtermCare = Math.floor(healthInsurance * RATE_LONGTERM_CARE / 10) * 10
    const residentTax = Math.floor(incomeTax * RATE_RESIDENT_TAX / 10) * 10
    return {
      nationalPension: 0,
      healthInsurance,
      longtermCare,
      employmentInsurance: 0,
      incomeTax,
      residentTax,
      businessTax: 0,
      total: healthInsurance + longtermCare + incomeTax + residentTax,
    }
  }
  if (taxType === '프리랜서3.3%') {
    const businessTax = Math.floor(gross * RATE_FREELANCE_TAX / 10) * 10
    const residentTax = Math.floor(gross * RATE_FREELANCE_RESIDENT / 10) * 10
    return {
      nationalPension: 0,
      healthInsurance: 0,
      longtermCare: 0,
      employmentInsurance: 0,
      incomeTax: 0,
      residentTax,
      businessTax,
      total: businessTax + residentTax,
    }
  }
  return {
    nationalPension: 0,
    healthInsurance: 0,
    longtermCare: 0,
    employmentInsurance: 0,
    incomeTax: 0,
    residentTax: 0,
    businessTax: 0,
    total: 0,
  }
}

/**
 * 급여명세서·회계 리포트 공용 계산.
 * - 세후 방식: 책정 net → 세전 gross 역산 → 공제 계산 → 실지급 = net + 상여금 - 추가공제
 * - 세전 방식: 지급총액(=기본급+상여금) 기준으로 공제 계산 → 실지급 = gross - 공제 - 추가공제
 */
export function computePayslip(input: PayslipCalcInput): PayslipCalcResult {
  const bookedAmount = input.finalAmount ?? input.autoAmount
  const extraItemsTotal = input.extraItems.reduce((s, it) => s + (it.amount || 0), 0)
  const extraDeductionsTotal = input.extraDeductions.reduce((s, it) => s + (it.amount || 0), 0)
  const isNetBasis = input.salaryBasis === '세후'
  const isAdjusted = input.finalAmount != null && input.finalAmount !== input.autoAmount

  let basePay: number
  let grossTotal: number
  let deductions: Deductions
  let netPay: number

  if (isNetBasis) {
    const approxGross = reverseGrossFromNet(bookedAmount, input.taxType, input.incomeTax)
    const approxDeductions = calculateDeductions(approxGross, input.taxType, input.incomeTax)
    basePay = bookedAmount + approxDeductions.total
    grossTotal = basePay + extraItemsTotal
    deductions = approxDeductions
    netPay = bookedAmount + extraItemsTotal - extraDeductionsTotal
  } else {
    basePay = bookedAmount
    grossTotal = basePay + extraItemsTotal
    deductions = calculateDeductions(grossTotal, input.taxType, input.incomeTax)
    netPay = grossTotal - deductions.total - extraDeductionsTotal
  }

  return {
    bookedAmount,
    basePay,
    extraItemsTotal,
    extraDeductionsTotal,
    grossTotal,
    deductions,
    netPay,
    isNetBasis,
    isAdjusted,
  }
}

/**
 * 지급 항목 프리셋을 카테고리별로 분류 (회계사 시트1 컬럼 매핑용).
 */
export function categorizePayItems(items: ExtraItem[]) {
  const buckets = {
    bonus: 0,          // 상여금
    meal: 0,           // 식대 (비과세)
    car: 0,            // 교통비 (비과세)
    otherAllowance: 0, // 야근/주휴/직책/명절/연장근로수당 등
    otherPay: 0,       // 프리셋 외 사용자 정의
    detail: [] as string[],
  }
  const knownAllowances = ['야근수당', '주휴수당', '직책수당', '명절수당', '연장근로수당']
  for (const it of items) {
    if (it.amount <= 0) continue
    buckets.detail.push(`${it.label} ${it.amount.toLocaleString('ko-KR')}`)
    if (it.label === '상여금') buckets.bonus += it.amount
    else if (it.label === '식대') buckets.meal += it.amount
    else if (it.label === '교통비') buckets.car += it.amount
    else if (knownAllowances.includes(it.label)) buckets.otherAllowance += it.amount
    else buckets.otherPay += it.amount
  }
  return buckets
}

export function categorizeDeductionItems(items: ExtraItem[]) {
  const total = items.reduce((s, it) => s + (it.amount || 0), 0)
  const detail = items.filter(it => it.amount > 0).map(it => `${it.label} ${it.amount.toLocaleString('ko-KR')}`)
  return { total, detail }
}
