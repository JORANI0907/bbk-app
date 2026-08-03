import type {
  PayrollInput,
  TaxRateMap,
  PayItem,
  DeductItem,
  EmployerCost,
  PayrollResult,
} from './types'

// ── 반올림 헬퍼 ─────────────────────────────────────────────────────────────
// 0.009 같은 율은 IEEE 754에서 완벽히 표현되지 않아 750000*0.009≈6749.9999가 될 수 있음.
// 0.1원 단위로 먼저 반올림해 부동소수 노이즈를 제거한 뒤 10원 미만 절사.
const floor10 = (n: number): number => {
  const tenths = Math.round(n * 10) / 10
  return Math.floor(tenths / 10) * 10
}
const floor1000 = (n: number): number => Math.floor(n / 1000) * 1000
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n))
const fmt = (n: number): string => n.toLocaleString('ko-KR')

// ── STEP 1: 통상시급 ─────────────────────────────────────────────────────────
export function calcOrdinaryHourlyWage(input: PayrollInput, rates: TaxRateMap): number {
  switch (input.employmentType) {
    case 'FULL_TIME':
    case 'CONTRACT':
      return Math.round(
        (input.monthlyBaseSalary ?? 0) /
          (input.contractedMonthlyHours ?? rates.standard_monthly_hours),
      )
    case 'PART_TIME':
    case 'ULTRA_SHORT':
      return input.hourlyWage ?? 0
    case 'DAILY':
      return Math.round((input.dailyWage ?? 0) / (input.dailyContractedHours ?? 8))
    default:
      return 0
  }
}

// ── STEP 2: 지급 항목 ─────────────────────────────────────────────────────────
function buildPayItems(
  input: PayrollInput,
  rates: TaxRateMap,
  ohw: number,
): { payItems: PayItem[]; grossPay: number; nonTaxable: number; taxablePay: number } {
  const items: PayItem[] = []
  const et = input.employmentType

  // 기본급 (고용형태별)
  if (et === 'FULL_TIME' || et === 'CONTRACT') {
    const base = input.monthlyBaseSalary ?? 0
    items.push({ key: 'base', label: '기본급', amount: base, calcMethod: '월 기본급', taxable: true })
  } else if (et === 'PART_TIME' || et === 'ULTRA_SHORT') {
    const hrs = input.actualMonthlyHours ?? 0
    const base = Math.round(ohw * hrs)
    items.push({
      key: 'base',
      label: '기본급',
      amount: base,
      calcMethod: `시급 ${fmt(ohw)}원 × ${hrs}h`,
      taxable: true,
    })
    const wh = input.contractedWeeklyHours ?? 0
    if (wh >= 15) {
      const dailyHours = Math.min(wh / 5, 8)
      const holidayPay = Math.round(ohw * dailyHours * rates.avg_weeks_per_month)
      items.push({
        key: 'weekly_holiday',
        label: '주휴수당',
        amount: holidayPay,
        calcMethod: `시급 ${fmt(ohw)}원 × ${dailyHours}h × ${rates.avg_weeks_per_month}주`,
        taxable: true,
      })
    }
  } else if (et === 'DAILY') {
    const days = input.workDays ?? 0
    const wage = input.dailyWage ?? 0
    items.push({
      key: 'base',
      label: '일당',
      amount: Math.round(wage * days),
      calcMethod: `일당 ${fmt(wage)}원 × ${days}일`,
      taxable: true,
    })
  } else if (et === 'FREELANCER') {
    const total = input.monthlyBaseSalary ?? 0
    items.push({
      key: 'business_income',
      label: '사업소득',
      amount: total,
      calcMethod: '사업소득 지급액',
      taxable: true,
    })
  }

  // 가산 수당 (DAILY/FREELANCER/SUBCONTRACT 제외)
  if (!['DAILY', 'FREELANCER', 'SUBCONTRACT'].includes(et)) {
    if (input.overtimeHours > 0) {
      items.push({
        key: 'overtime',
        label: '연장근로수당',
        amount: Math.round(ohw * input.overtimeHours * 1.5),
        calcMethod: `통상시급 ${fmt(ohw)}원 × ${input.overtimeHours}h × 1.5`,
        taxable: true,
      })
    }
    if (input.nightHours > 0) {
      items.push({
        key: 'night',
        label: '야간근로수당',
        amount: Math.round(ohw * input.nightHours * 0.5),
        calcMethod: `통상시급 ${fmt(ohw)}원 × ${input.nightHours}h × 0.5`,
        taxable: true,
      })
    }
    if (input.holidayHoursWithin8 > 0) {
      items.push({
        key: 'holiday_w8',
        label: '휴일수당(8h이내)',
        amount: Math.round(ohw * input.holidayHoursWithin8 * 1.5),
        calcMethod: `통상시급 ${fmt(ohw)}원 × ${input.holidayHoursWithin8}h × 1.5`,
        taxable: true,
      })
    }
    if (input.holidayHoursOver8 > 0) {
      items.push({
        key: 'holiday_o8',
        label: '휴일수당(8h초과)',
        amount: Math.round(ohw * input.holidayHoursOver8 * 2.0),
        calcMethod: `통상시급 ${fmt(ohw)}원 × ${input.holidayHoursOver8}h × 2.0`,
        taxable: true,
      })
    }
    if (input.unusedAnnualLeaveDays > 0) {
      items.push({
        key: 'unused_leave',
        label: '연차미사용수당',
        amount: Math.round(ohw * 8 * input.unusedAnnualLeaveDays),
        calcMethod: `통상시급 ${fmt(ohw)}원 × 8h × ${input.unusedAnnualLeaveDays}일`,
        taxable: true,
      })
    }
    if (input.otherTaxableAllowance > 0) {
      items.push({
        key: 'other_taxable',
        label: '기타과세수당',
        amount: input.otherTaxableAllowance,
        calcMethod: '별도 지급',
        taxable: true,
      })
    }
  }

  // 식대 (비과세 한도 내 / 초과분 과세)
  if (input.mealAllowance > 0 && et !== 'FREELANCER' && et !== 'SUBCONTRACT') {
    const nonTax = Math.min(input.mealAllowance, rates.meal_allowance_limit)
    const overflow = Math.max(0, input.mealAllowance - rates.meal_allowance_limit)
    items.push({
      key: 'meal',
      label: '식대',
      amount: nonTax,
      calcMethod: `비과세 (월 ${fmt(rates.meal_allowance_limit)}원 한도)`,
      taxable: false,
    })
    if (overflow > 0) {
      items.push({
        key: 'meal_taxable',
        label: '식대(한도초과)',
        amount: overflow,
        calcMethod: `한도 초과분 과세`,
        taxable: true,
      })
    }
  }

  // 자가운전보조금 (비과세 한도 내 / 초과분 과세)
  if (input.carAllowance > 0 && et !== 'FREELANCER' && et !== 'SUBCONTRACT') {
    const nonTax = Math.min(input.carAllowance, rates.car_allowance_limit)
    const overflow = Math.max(0, input.carAllowance - rates.car_allowance_limit)
    items.push({
      key: 'car',
      label: '자가운전보조금',
      amount: nonTax,
      calcMethod: `비과세 (월 ${fmt(rates.car_allowance_limit)}원 한도)`,
      taxable: false,
    })
    if (overflow > 0) {
      items.push({
        key: 'car_taxable',
        label: '자가운전보조금(한도초과)',
        amount: overflow,
        calcMethod: `한도 초과분 과세`,
        taxable: true,
      })
    }
  }

  const grossPay = items.reduce((sum, item) => sum + item.amount, 0)
  const nonTaxable = items.filter(i => !i.taxable).reduce((sum, i) => sum + i.amount, 0)
  const taxablePay = grossPay - nonTaxable

  return { payItems: items, grossPay, nonTaxable, taxablePay }
}

// ── STEP 3: 공제 항목 (근로자 공통) ───────────────────────────────────────────
function calcDeductionsEmployee(
  input: PayrollInput,
  rates: TaxRateMap,
  taxablePay: number,
): DeductItem[] {
  const items: DeductItem[] = []
  const ltcRatio = rates.ltc_insurance_total / (rates.health_insurance_employee + rates.health_insurance_employer)

  if (input.enrolledNationalPension) {
    const base = clamp(floor1000(taxablePay), rates.national_pension_floor, rates.national_pension_cap)
    const amount = floor10(base * rates.national_pension_employee)
    items.push({
      key: 'national_pension',
      label: '국민연금',
      amount,
      calcMethod: `기준소득월액 ${fmt(base)}원 × ${(rates.national_pension_employee * 100).toFixed(2)}% (상한 ${fmt(rates.national_pension_cap)}원)`,
    })
  }

  if (input.enrolledHealthInsurance) {
    const hi = floor10(taxablePay * rates.health_insurance_employee)
    items.push({
      key: 'health_insurance',
      label: '건강보험',
      amount: hi,
      calcMethod: `과세대상급여 × ${(rates.health_insurance_employee * 100).toFixed(3)}%`,
    })
    const ltc = floor10(hi * ltcRatio)
    items.push({
      key: 'ltc_insurance',
      label: '장기요양보험',
      amount: ltc,
      calcMethod: `건강보험료 ${fmt(hi)}원 × ${(ltcRatio * 100).toFixed(4)}%`,
    })
  }

  if (input.enrolledEmploymentInsurance) {
    const ei = floor10(taxablePay * rates.employment_insurance_employee)
    items.push({
      key: 'employment_insurance',
      label: '고용보험',
      amount: ei,
      calcMethod: `과세대상급여 × ${(rates.employment_insurance_employee * 100).toFixed(1)}%`,
    })
  }

  const income = input.incomeTax ?? 0
  if (income > 0) {
    items.push({
      key: 'income_tax',
      label: '소득세',
      amount: income,
      calcMethod: '간이세액표 적용',
    })
    items.push({
      key: 'local_income_tax',
      label: '지방소득세',
      amount: floor10(income * rates.local_income_tax),
      calcMethod: `소득세 ${fmt(income)}원 × 10%`,
    })
  }

  if (input.otherDeductions > 0) {
    items.push({ key: 'other', label: '기타공제', amount: input.otherDeductions, calcMethod: '기타' })
  }

  return items
}

// ── STEP 4: 공제 항목 (일용직) ───────────────────────────────────────────────
function calcDeductionsDaily(
  input: PayrollInput,
  rates: TaxRateMap,
  grossPay: number,
): DeductItem[] {
  const items: DeductItem[] = []
  const ltcRatio = rates.ltc_insurance_total / (rates.health_insurance_employee + rates.health_insurance_employer)
  const wage = input.dailyWage ?? 0
  const days = input.workDays ?? 0

  const rawDailyTax = floor10(Math.max(wage - rates.daily_worker_deduction, 0) * rates.daily_worker_tax_rate)
  // 소액부징수: 1일 세액 1,000원 미만이면 0
  const dailyTax = rawDailyTax < 1000 ? 0 : rawDailyTax
  const incomeTax = dailyTax > 0 ? Math.round(dailyTax * days) : 0

  if (incomeTax > 0) {
    items.push({
      key: 'income_tax',
      label: '소득세',
      amount: incomeTax,
      calcMethod: `(일당 ${fmt(wage)}원 - ${fmt(rates.daily_worker_deduction)}원) × ${(rates.daily_worker_tax_rate * 100).toFixed(1)}% × ${days}일`,
    })
    const local = floor10(incomeTax * rates.local_income_tax)
    if (local > 0) {
      items.push({
        key: 'local_income_tax',
        label: '지방소득세',
        amount: local,
        calcMethod: `소득세 ${fmt(incomeTax)}원 × 10%`,
      })
    }
  }

  // 고용보험: 일용직은 하루만 일해도 가입 대상
  if (input.enrolledEmploymentInsurance) {
    items.push({
      key: 'employment_insurance',
      label: '고용보험',
      amount: floor10(grossPay * rates.employment_insurance_employee),
      calcMethod: `지급액계 ${fmt(grossPay)}원 × ${(rates.employment_insurance_employee * 100).toFixed(1)}%`,
    })
  }

  // 국민연금/건강보험: 1개월 이상 + (월 8일 이상 or 60h 이상) 조건 → boolean 플래그로 제어
  if (input.enrolledNationalPension) {
    const base = clamp(floor1000(grossPay), rates.national_pension_floor, rates.national_pension_cap)
    items.push({
      key: 'national_pension',
      label: '국민연금',
      amount: floor10(base * rates.national_pension_employee),
      calcMethod: `기준소득월액 ${fmt(base)}원 × ${(rates.national_pension_employee * 100).toFixed(2)}%`,
    })
  }

  if (input.enrolledHealthInsurance) {
    const hi = floor10(grossPay * rates.health_insurance_employee)
    items.push({
      key: 'health_insurance',
      label: '건강보험',
      amount: hi,
      calcMethod: `지급액계 × ${(rates.health_insurance_employee * 100).toFixed(3)}%`,
    })
    items.push({
      key: 'ltc_insurance',
      label: '장기요양보험',
      amount: floor10(hi * ltcRatio),
      calcMethod: `건강보험료 ${fmt(hi)}원 × ${(ltcRatio * 100).toFixed(4)}%`,
    })
  }

  if (input.otherDeductions > 0) {
    items.push({ key: 'other', label: '기타공제', amount: input.otherDeductions, calcMethod: '기타' })
  }

  return items
}

// ── STEP 5: 공제 항목 (프리랜서) ─────────────────────────────────────────────
function calcDeductionsFreelancer(
  input: PayrollInput,
  rates: TaxRateMap,
  grossPay: number,
): DeductItem[] {
  const items: DeductItem[] = []

  const incomeTax = floor10(grossPay * rates.business_income_tax)
  items.push({
    key: 'income_tax',
    label: '사업소득세(원천징수)',
    amount: incomeTax,
    calcMethod: `지급총액 ${fmt(grossPay)}원 × ${(rates.business_income_tax * 100).toFixed(0)}%`,
  })
  items.push({
    key: 'local_income_tax',
    label: '지방소득세',
    amount: floor10(incomeTax * rates.local_income_tax),
    calcMethod: `사업소득세 ${fmt(incomeTax)}원 × 10%`,
  })

  if (input.otherDeductions > 0) {
    items.push({ key: 'other', label: '기타공제', amount: input.otherDeductions, calcMethod: '기타' })
  }

  return items
}

// ── STEP 6: 회사 부담액 ──────────────────────────────────────────────────────
function calcEmployerCost(
  input: PayrollInput,
  rates: TaxRateMap,
  taxablePay: number,
  grossPay: number,
  employeeNP: number,
  employeeHI: number,
  employeeLTC: number,
): EmployerCost {
  const nationalPension = input.enrolledNationalPension ? employeeNP : 0
  const healthInsurance = input.enrolledHealthInsurance ? employeeHI : 0
  const ltcInsurance = input.enrolledHealthInsurance ? employeeLTC : 0
  const employmentInsurance = input.enrolledEmploymentInsurance
    ? floor10(taxablePay * rates.employment_insurance_employer)
    : 0
  const employmentStability = floor10(taxablePay * rates.employment_stability)
  const industrialAccident = floor10(taxablePay * rates.industrial_accident_rate)
  const wageClaimGuarantee = floor10(taxablePay * rates.wage_claim_guarantee)
  const severanceAccrual = floor10(grossPay * rates.severance_accrual)

  const total =
    nationalPension +
    healthInsurance +
    ltcInsurance +
    employmentInsurance +
    employmentStability +
    industrialAccident +
    wageClaimGuarantee +
    severanceAccrual

  return {
    nationalPension,
    healthInsurance,
    ltcInsurance,
    employmentInsurance,
    employmentStability,
    industrialAccident,
    wageClaimGuarantee,
    severanceAccrual,
    total,
  }
}

// ── 메인 진입점 ──────────────────────────────────────────────────────────────
export function calculatePayroll(input: PayrollInput, rates: TaxRateMap): PayrollResult {
  const warnings: string[] = []

  const ordinaryHourlyWage = calcOrdinaryHourlyWage(input, rates)

  if (
    ordinaryHourlyWage > 0 &&
    ordinaryHourlyWage < rates.minimum_hourly_wage &&
    input.employmentType !== 'FREELANCER' &&
    input.employmentType !== 'SUBCONTRACT'
  ) {
    warnings.push(
      `통상시급 ${fmt(ordinaryHourlyWage)}원이 최저임금 ${fmt(rates.minimum_hourly_wage)}원에 미달합니다.`,
    )
  }

  if (rates.industrial_accident_rate === 0) {
    warnings.push('산재보험요율이 미입력 상태입니다. 근로복지공단 고지서를 확인하세요.')
  }

  const { payItems, grossPay, nonTaxable, taxablePay } = buildPayItems(input, rates, ordinaryHourlyWage)

  let deductItems: DeductItem[]
  switch (input.employmentType) {
    case 'DAILY':
      deductItems = calcDeductionsDaily(input, rates, grossPay)
      break
    case 'FREELANCER':
      deductItems = calcDeductionsFreelancer(input, rates, grossPay)
      break
    case 'SUBCONTRACT':
      deductItems = []
      break
    default:
      deductItems = calcDeductionsEmployee(input, rates, taxablePay)
  }

  const totalDeduction = deductItems.reduce((sum, d) => sum + d.amount, 0)
  const netPay = grossPay - totalDeduction

  const employeeNP = deductItems.find(d => d.key === 'national_pension')?.amount ?? 0
  const employeeHI = deductItems.find(d => d.key === 'health_insurance')?.amount ?? 0
  const employeeLTC = deductItems.find(d => d.key === 'ltc_insurance')?.amount ?? 0

  const employerCost = calcEmployerCost(
    input,
    rates,
    taxablePay,
    grossPay,
    employeeNP,
    employeeHI,
    employeeLTC,
  )

  return {
    ordinaryHourlyWage,
    payItems,
    grossPay,
    nonTaxable,
    taxablePay,
    deductItems,
    totalDeduction,
    netPay,
    employerCost,
    warnings,
  }
}
