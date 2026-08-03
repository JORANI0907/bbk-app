export type EmploymentType =
  | 'FULL_TIME'
  | 'CONTRACT'
  | 'PART_TIME'
  | 'ULTRA_SHORT'
  | 'DAILY'
  | 'FREELANCER'
  | 'SUBCONTRACT'

export interface TaxRateMap {
  national_pension_employee: number      // 0.0475
  national_pension_employer: number      // 0.0475
  national_pension_cap: number           // 6370000
  national_pension_floor: number         // 400000
  health_insurance_employee: number      // 0.03595
  health_insurance_employer: number      // 0.03595
  ltc_insurance_total: number            // 0.009448 (노사합산)
  employment_insurance_employee: number  // 0.009
  employment_insurance_employer: number  // 0.009
  employment_stability: number           // 0.0025
  industrial_accident_rate: number       // 업종별 산재요율 (미입력 시 0)
  wage_claim_guarantee: number           // 0.0009
  severance_accrual: number              // 0.0833
  local_income_tax: number               // 0.1
  standard_monthly_hours: number         // 209
  minimum_hourly_wage: number            // 10320
  meal_allowance_limit: number           // 200000
  car_allowance_limit: number            // 200000
  daily_worker_deduction: number         // 150000
  daily_worker_tax_rate: number          // 0.027
  business_income_tax: number            // 0.03
  avg_weeks_per_month: number            // 4.345
}

export const DEFAULT_RATES_2026: TaxRateMap = {
  national_pension_employee:     0.0475,
  national_pension_employer:     0.0475,
  national_pension_cap:          6370000,
  national_pension_floor:        400000,
  health_insurance_employee:     0.03595,
  health_insurance_employer:     0.03595,
  ltc_insurance_total:           0.009448,
  employment_insurance_employee: 0.009,
  employment_insurance_employer: 0.009,
  employment_stability:          0.0025,
  industrial_accident_rate:      0,
  wage_claim_guarantee:          0.0009,
  severance_accrual:             0.0833,
  local_income_tax:              0.1,
  standard_monthly_hours:        209,
  minimum_hourly_wage:           10320,
  meal_allowance_limit:          200000,
  car_allowance_limit:           200000,
  daily_worker_deduction:        150000,
  daily_worker_tax_rate:         0.027,
  business_income_tax:           0.03,
  avg_weeks_per_month:           4.345,
}

export interface PayrollInput {
  employmentType: EmploymentType
  payPeriod: { year: number; month: number }
  paymentDate: string

  // 급여 조건
  monthlyBaseSalary?: number
  hourlyWage?: number
  dailyWage?: number
  contractedMonthlyHours?: number
  contractedWeeklyHours?: number
  actualMonthlyHours?: number
  workDays?: number
  dailyContractedHours?: number

  // 가산 대상 시간
  overtimeHours: number
  nightHours: number
  holidayHoursWithin8: number
  holidayHoursOver8: number
  unusedAnnualLeaveDays: number

  // 수당
  otherTaxableAllowance: number
  mealAllowance: number
  carAllowance: number

  // 4대보험 가입 여부
  enrolledNationalPension: boolean
  enrolledHealthInsurance: boolean
  enrolledEmploymentInsurance: boolean

  // 세금
  incomeTax: number
  dependents: number

  otherDeductions: number
}

export interface PayItem {
  key: string
  label: string
  amount: number
  calcMethod: string
  taxable: boolean
}

export interface DeductItem {
  key: string
  label: string
  amount: number
  calcMethod: string
}

export interface EmployerCost {
  nationalPension: number
  healthInsurance: number
  ltcInsurance: number
  employmentInsurance: number
  employmentStability: number
  industrialAccident: number
  wageClaimGuarantee: number
  severanceAccrual: number
  total: number
}

export interface PayrollResult {
  ordinaryHourlyWage: number
  payItems: PayItem[]
  grossPay: number
  nonTaxable: number
  taxablePay: number
  deductItems: DeductItem[]
  totalDeduction: number
  netPay: number
  employerCost: EmployerCost
  warnings: string[]
}
