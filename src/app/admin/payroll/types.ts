// 급여정산 페이지 공통 타입

export type TaxType = '4대보험' | '2대보험' | '3대보험' | '프리랜서3.3%' | '없음'

export interface InsuranceRates {
  nationalPension: number       // 국민연금 (기본 4.5%)
  healthInsurance: number       // 건강보험 (기본 3.545%)
  longtermCare: number          // 장기요양보험 = 건강보험료의 x% (기본 12.95%)
  employmentInsurance: number   // 고용보험 (기본 0.9%)
  residentTax: number           // 지방소득세 = 소득세의 x% (기본 10%)
  incomeTax: number             // 근로소득세 (기본 3.3%) · 지급총액 × x%
}

export const DEFAULT_INSURANCE_RATES: InsuranceRates = {
  nationalPension: 0.045,
  healthInsurance: 0.03545,
  longtermCare: 0.1295,
  employmentInsurance: 0.009,
  residentTax: 0.1,
  incomeTax: 0.033,
}

export interface ExtraPayItem {
  label: string
  amount: number
}

export interface ManagerJob {
  id: string
  assigned_to: string
  business_name: string
  service_type: string
  construction_date: string
  manager_pay: number | null
  unit_price_per_visit: number | null
  resolved_pay: number
}

export interface WorkerJob {
  id: string
  worker_id: string
  business_name: string
  construction_date: string
  salary: number | null
  application_id: string | null
}

export interface PayrollRecord {
  id: string
  year_month: string
  person_type: 'user' | 'worker'
  person_id: string
  auto_amount: number
  final_amount: number | null
  note: string | null
  is_paid: boolean
  paid_at: string | null
  extra_items: ExtraPayItem[]
  extra_deductions: ExtraPayItem[]
}

export interface ManagerEntry {
  person: {
    id: string
    name: string
    role: string
    phone: string | null
    account_number: string | null
    // workers 매핑을 통한 세금/급여기준 (매핑 없으면 null)
    tax_type: TaxType | null
    salary_basis: '세전' | '세후' | null
    worker_id: string | null  // 편집 대상 workers row (담당자가 workers에 매핑된 경우)
  }
  jobs: ManagerJob[]
  auto_amount: number
  record: PayrollRecord | undefined
}

export interface WorkerEntry {
  person: {
    id: string
    name: string
    employment_type: string | null
    day_wage: number | null
    night_wage: number | null
    avg_salary: number | null
    phone: string | null
    account_number: string | null
    tax_type: TaxType | null
    salary_basis: '세전' | '세후' | null
  }
  jobs: WorkerJob[]
  auto_amount: number
  record: PayrollRecord | undefined
}

export interface UnitPriceApp {
  id: string
  business_name: string
  service_type: string
  construction_date: string | null
  unit_price_per_visit: number | null
  assigned_to: string | null
}
