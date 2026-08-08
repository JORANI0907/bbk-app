/**
 * 급여정산 엑셀 export 공용 데이터 조회·계산 로직.
 * /api/admin/payroll/export/detail (급여상세) · /export/bank (급여이체) 두 route 가 공용으로 사용.
 */

import { createServiceClient } from '@/lib/supabase/server'
import {
  computePayslip,
  categorizePayItems,
  categorizeDeductionItems,
  DEFAULT_PAYSLIP_RATES,
  type TaxType,
  type SalaryBasis,
  type PayslipRates,
} from '@/lib/payroll/payslipCalc'

// ─── 유틸 ────────────────────────────────────────────────────────────────────

export function getMonthEndDate(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  return `${yearMonth}-${String(lastDay).padStart(2, '0')}`
}

export function defaultPayDate(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  const next = new Date(year, month, 10)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
}

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  FULL_TIME: '정규직',
  CONTRACT: '계약직',
  PART_TIME: '파트타임',
  DAILY: '일용직',
  FREELANCER: '프리랜서',
  SUBCONTRACT: '도급',
  ULTRA_SHORT: '초단시간',
}
export function labelEmploymentType(raw: string | null | undefined): string {
  if (!raw) return '-'
  return EMPLOYMENT_TYPE_LABELS[raw] ?? raw
}

export function parseAccount(raw: string | null): { bank: string; number: string } {
  if (!raw) return { bank: '', number: '' }
  const trimmed = raw.trim()
  const idx = trimmed.search(/\s/)
  if (idx > 0) {
    const first = trimmed.slice(0, idx)
    if (/^[가-힣]/.test(first)) {
      return { bank: first, number: trimmed.slice(idx + 1).trim() }
    }
  }
  return { bank: '', number: trimmed }
}

// ─── 타입 ────────────────────────────────────────────────────────────────────

type AppRow = {
  id: string
  assigned_to: string | null
  business_name: string
  service_type: string
  construction_date: string
  manager_pay: number | null
  unit_price_per_visit: number | null
  resolved_pay: number
}

type AssignRow = {
  id: string
  worker_id: string | null
  business_name: string
  construction_date: string
  salary: number | null
  application_id: string | null
}

export type ExtraItem = { label: string; amount: number }

type RecordRow = {
  id: string
  year_month: string
  person_type: string
  person_id: string
  auto_amount: number
  final_amount: number | null
  note: string | null
  is_paid: boolean
  paid_at: string | null
  extra_items: ExtraItem[] | null
  extra_deductions: ExtraItem[] | null
}

type PayslipRow = {
  person_type: string
  person_id: string
  pay_date: string | null
}

export interface DetailRow {
  personType: 'user' | 'worker'
  personId: string
  name: string
  roleLabel: string
  employmentType: string
  taxType: TaxType
  salaryBasis: SalaryBasis
  workDays: number
  jobCount: number
  basePay: number
  bonus: number
  meal: number
  car: number
  otherAllowance: number
  otherPay: number
  grossTotal: number
  nationalPension: number
  healthInsurance: number
  longtermCare: number
  employmentInsurance: number
  incomeTax: number
  residentTax: number
  businessTax: number
  extraDedTotal: number
  deductionTotal: number
  netPay: number
  payDate: string
  isPaid: boolean
  accountRaw: string | null
  bankCode: string | null
  bankName: string | null
  note: string
}

export interface ExportBundle {
  month: string
  monthLabel: string
  managerDetails: DetailRow[]
  workerDetails: DetailRow[]
  rates: PayslipRates
}

// ─── 메인 조회 ────────────────────────────────────────────────────────────────

export async function loadExportBundle(
  month: string,
  filter?: { user_ids?: string[]; worker_ids?: string[] } | null,
): Promise<ExportBundle> {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    throw new Error('month 파라미터가 필요합니다. (YYYY-MM)')
  }
  const hasFilter = !!(filter && (
    (filter.user_ids && filter.user_ids.length > 0) ||
    (filter.worker_ids && filter.worker_ids.length > 0)
  ))
  const userIdSet = new Set(filter?.user_ids ?? [])
  const workerIdSet = new Set(filter?.worker_ids ?? [])

  const supabase = createServiceClient()

  const [
    appsRes, assignRes, usersRes, workersRes,
    linkedWorkersRes, recordsRes, pricesRes, payslipsRes, settingsRes,
  ] = await Promise.all([
    supabase
      .from('service_applications')
      .select('id, assigned_to, business_name, service_type, construction_date, manager_pay, unit_price_per_visit')
      .not('assigned_to', 'is', null)
      .gte('construction_date', `${month}-01`)
      .lte('construction_date', getMonthEndDate(month))
      .order('construction_date'),
    supabase
      .from('work_assignments')
      .select('id, worker_id, business_name, construction_date, salary, application_id')
      .gte('construction_date', `${month}-01`)
      .lte('construction_date', getMonthEndDate(month))
      .order('construction_date'),
    supabase.from('users').select('id, name, role, phone, account_number, bank_code, bank_name, email').in('role', ['worker', 'admin']).eq('is_active', true).order('name'),
    supabase.from('workers').select('id, name, employment_type, phone, account_number, bank_code, bank_name, email, tax_type, salary_basis').order('name'),
    supabase.from('workers').select('user_id, tax_type, salary_basis, employment_type, account_number, bank_code, bank_name, email, phone').not('user_id', 'is', null),
    supabase.from('payroll_records').select('*').eq('year_month', month),
    supabase.from('unit_price_monthly').select('application_id, unit_price').eq('year_month', month),
    supabase.from('payroll_payslips').select('person_type, person_id, pay_date').eq('year_month', month),
    supabase.from('payroll_settings').select('insurance_rates').eq('id', 'default').maybeSingle(),
  ])

  if (appsRes.error) throw new Error(appsRes.error.message)
  if (assignRes.error) throw new Error(assignRes.error.message)
  if (usersRes.error) throw new Error(usersRes.error.message)
  if (workersRes.error) throw new Error(workersRes.error.message)
  if (recordsRes.error) throw new Error(recordsRes.error.message)

  const apps: AppRow[] = (appsRes.data ?? []).map(a => ({ ...a, resolved_pay: 0 }))
  const assignments: AssignRow[] = assignRes.data ?? []
  const users = usersRes.data ?? []
  const workers = workersRes.data ?? []
  const linkedWorkers = linkedWorkersRes.data ?? []
  const records: RecordRow[] = recordsRes.data ?? []
  const monthlyPriceMap = new Map<string, number>((pricesRes.data ?? []).map(p => [p.application_id, p.unit_price]))
  const recordMap = new Map<string, RecordRow>(records.map(r => [`${r.person_type}:${r.person_id}`, r]))
  const rates: PayslipRates = {
    ...DEFAULT_PAYSLIP_RATES,
    ...((settingsRes.data?.insurance_rates ?? {}) as Partial<PayslipRates>),
  }

  const userTaxMap = new Map<string, {
    taxType: TaxType
    salaryBasis: SalaryBasis
    employmentType: string | null
    accountNumber: string | null
    bankCode: string | null
    bankName: string | null
    email: string | null
    phone: string | null
  }>()
  for (const lw of linkedWorkers) {
    if (!lw.user_id) continue
    userTaxMap.set(lw.user_id, {
      taxType: (lw.tax_type as TaxType) ?? '4대보험',
      salaryBasis: (lw.salary_basis as SalaryBasis) ?? '세전',
      employmentType: lw.employment_type,
      accountNumber: lw.account_number,
      bankCode: lw.bank_code,
      bankName: lw.bank_name,
      email: lw.email,
      phone: lw.phone,
    })
  }

  const payDateMap = new Map<string, string>()
  for (const p of (payslipsRes.data ?? []) as PayslipRow[]) {
    if (p.pay_date) payDateMap.set(`${p.person_type}:${p.person_id}`, p.pay_date)
  }
  const fallbackPayDate = defaultPayDate(month)

  // 담당자 집계
  type ManagerEntry = { person: typeof users[number]; jobs: AppRow[]; autoAmount: number; record: RecordRow | undefined }
  const managerMap = new Map<string, ManagerEntry>()
  for (const app of apps) {
    if (!app.assigned_to) continue
    const user = users.find(u => u.id === app.assigned_to)
    if (!user) continue
    if (!managerMap.has(app.assigned_to)) {
      managerMap.set(app.assigned_to, { person: user, jobs: [], autoAmount: 0, record: recordMap.get(`user:${app.assigned_to}`) })
    }
    const entry = managerMap.get(app.assigned_to)!
    const monthlyPrice = monthlyPriceMap.get(app.id) ?? null
    const pay = (app.manager_pay ?? monthlyPrice ?? app.unit_price_per_visit) ?? 0
    entry.jobs.push({ ...app, resolved_pay: pay })
    entry.autoAmount += pay
  }

  // 작업자 집계
  type WorkerEntry = { person: typeof workers[number]; jobs: AssignRow[]; autoAmount: number; record: RecordRow | undefined }
  const workerMap = new Map<string, WorkerEntry>()
  for (const assign of assignments) {
    if (!assign.worker_id) continue
    const worker = workers.find(w => w.id === assign.worker_id)
    if (!worker) continue
    if (!workerMap.has(assign.worker_id)) {
      workerMap.set(assign.worker_id, { person: worker, jobs: [], autoAmount: 0, record: recordMap.get(`worker:${assign.worker_id}`) })
    }
    const entry = workerMap.get(assign.worker_id)!
    entry.jobs.push(assign)
    entry.autoAmount += assign.salary ?? 0
  }

  let managerEntries = Array.from(managerMap.values())
  let workerEntries = Array.from(workerMap.values())

  if (hasFilter) {
    managerEntries = managerEntries.filter(e => userIdSet.has(e.person.id))
    workerEntries = workerEntries.filter(e => workerIdSet.has(e.person.id))
  }

  const buildDetail = (
    personType: 'user' | 'worker',
    personId: string,
    name: string,
    roleLabel: string,
    employmentType: string,
    taxType: TaxType,
    salaryBasis: SalaryBasis,
    workDays: number,
    jobCount: number,
    autoAmount: number,
    record: RecordRow | undefined,
    accountRaw: string | null,
    bankCode: string | null,
    bankName: string | null,
    payDate: string,
  ): DetailRow => {
    const extraItems = (record?.extra_items ?? []) as ExtraItem[]
    const extraDeductions = (record?.extra_deductions ?? []) as ExtraItem[]
    const calc = computePayslip({
      autoAmount,
      finalAmount: record?.final_amount ?? null,
      extraItems,
      extraDeductions,
      taxType,
      salaryBasis,
      rates,
    })
    const payBucket = categorizePayItems(extraItems)
    const dedBucket = categorizeDeductionItems(extraDeductions)
    const parts: string[] = []
    if (record?.note?.trim()) parts.push(`메모: ${record.note.trim()}`)
    if (payBucket.detail.length > 0) parts.push(`지급세부: ${payBucket.detail.join(' / ')}`)
    if (dedBucket.detail.length > 0) parts.push(`공제세부: ${dedBucket.detail.join(' / ')}`)

    return {
      personType, personId,
      name, roleLabel, employmentType, taxType, salaryBasis,
      workDays, jobCount,
      basePay: calc.basePay,
      bonus: payBucket.bonus,
      meal: payBucket.meal,
      car: payBucket.car,
      otherAllowance: payBucket.otherAllowance,
      otherPay: payBucket.otherPay,
      grossTotal: calc.grossTotal,
      nationalPension: calc.deductions.nationalPension,
      healthInsurance: calc.deductions.healthInsurance,
      longtermCare: calc.deductions.longtermCare,
      employmentInsurance: calc.deductions.employmentInsurance,
      incomeTax: calc.deductions.incomeTax,
      residentTax: calc.deductions.residentTax,
      businessTax: calc.deductions.businessTax,
      extraDedTotal: calc.extraDeductionsTotal,
      deductionTotal: calc.deductions.total + calc.extraDeductionsTotal,
      netPay: calc.netPay,
      payDate,
      isPaid: record?.is_paid ?? false,
      accountRaw, bankCode, bankName,
      note: parts.join(' | '),
    }
  }

  const managerDetails: DetailRow[] = managerEntries.map(e => {
    const linked = userTaxMap.get(e.person.id)
    const workDays = new Set(e.jobs.map(j => j.construction_date)).size
    const roleLabel = e.person.role === 'admin' ? '관리자' : '직원'
    const employmentType = linked?.employmentType ? labelEmploymentType(linked.employmentType) : roleLabel
    const payDate = payDateMap.get(`user:${e.person.id}`) ?? fallbackPayDate
    return buildDetail(
      'user', e.person.id,
      e.person.name, roleLabel, employmentType,
      linked?.taxType ?? '4대보험',
      linked?.salaryBasis ?? '세전',
      workDays, e.jobs.length, e.autoAmount, e.record,
      e.person.account_number ?? linked?.accountNumber ?? null,
      e.person.bank_code ?? linked?.bankCode ?? null,
      e.person.bank_name ?? linked?.bankName ?? null,
      payDate,
    )
  })

  const workerDetails: DetailRow[] = workerEntries.map(e => {
    const workDays = new Set(e.jobs.map(j => j.construction_date)).size
    const payDate = payDateMap.get(`worker:${e.person.id}`) ?? fallbackPayDate
    return buildDetail(
      'worker', e.person.id,
      e.person.name, '작업자', labelEmploymentType(e.person.employment_type),
      (e.person.tax_type as TaxType) ?? '없음',
      (e.person.salary_basis as SalaryBasis) ?? '세전',
      workDays, e.jobs.length, e.autoAmount, e.record,
      e.person.account_number ?? null,
      e.person.bank_code ?? null,
      e.person.bank_name ?? null,
      payDate,
    )
  })

  const [y, m] = month.split('-')
  const monthLabel = `${y}년 ${Number(m)}월`

  return { month, monthLabel, managerDetails, workerDetails, rates }
}
