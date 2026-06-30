// 급여정산 페이지 공통 타입

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
}

export interface ManagerEntry {
  person: { id: string; name: string; role: string; phone: string | null; account_number: string | null }
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
