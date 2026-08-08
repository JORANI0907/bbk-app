import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
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

// ─── 유틸리티 ────────────────────────────────────────────────────────────────

function getMonthEndDate(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  return `${yearMonth}-${String(lastDay).padStart(2, '0')}`
}

function defaultPayDate(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  const next = new Date(year, month, 10)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
}

// account_number 문자열에서 은행명과 계좌번호를 분리 (예: "국민 123-45-6789" → { bank: "국민", number: "123-45-6789" })
function parseAccount(raw: string | null): { bank: string; number: string } {
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

type ExtraItem = { label: string; amount: number }

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

// ─── POST /api/admin/payroll/export ──────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { month, filter } = body as {
      month?: string
      filter?: { user_ids?: string[]; worker_ids?: string[] } | null
    }

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'month 파라미터가 필요합니다. (YYYY-MM)' }, { status: 400 })
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
      supabase.from('users').select('id, name, role, phone, account_number, email').in('role', ['worker', 'admin']).eq('is_active', true).order('name'),
      supabase.from('workers').select('id, name, employment_type, phone, account_number, email, tax_type, salary_basis').order('name'),
      // users 담당자용 세금 설정 조회 (workers.user_id 매핑)
      supabase.from('workers').select('user_id, tax_type, salary_basis, employment_type').not('user_id', 'is', null),
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

    // 담당자(users) → workers 매핑을 통해 taxType/basis 조회
    const userTaxMap = new Map<string, { taxType: TaxType; salaryBasis: SalaryBasis; employmentType: string | null }>()
    for (const lw of linkedWorkers) {
      if (!lw.user_id) continue
      userTaxMap.set(lw.user_id, {
        taxType: (lw.tax_type as TaxType) ?? '4대보험',
        salaryBasis: (lw.salary_basis as SalaryBasis) ?? '세전',
        employmentType: lw.employment_type,
      })
    }

    // 지급일 조회 (payslips 테이블에서 발행된 pay_date가 있으면 그 값)
    const payDateMap = new Map<string, string>()
    for (const p of (payslipsRes.data ?? []) as PayslipRow[]) {
      if (p.pay_date) payDateMap.set(`${p.person_type}:${p.person_id}`, p.pay_date)
    }
    const fallbackPayDate = defaultPayDate(month)

    // ── 담당자 집계 ──
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

    // ── 작업자 집계 ──
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

    const [y, m] = month.split('-')
    const monthLabel = `${y}년 ${Number(m)}월`
    const payLabel = `${Number(m)}월급여`

    // ─── 인원별 상세 계산 (payslipCalc 공용 함수 사용) ─────────────────────
    type DetailRow = {
      name: string
      roleLabel: string           // "관리자"·"직원"·"작업자"
      employmentType: string      // 고용형태
      taxType: TaxType
      salaryBasis: SalaryBasis
      workDays: number
      jobCount: number
      basePay: number             // 기본급
      bonus: number               // 상여금
      meal: number                // 식대
      car: number                 // 교통비
      otherAllowance: number      // 기타수당
      otherPay: number            // 기타지급
      grossTotal: number          // 지급합계
      nationalPension: number
      healthInsurance: number
      longtermCare: number
      employmentInsurance: number
      incomeTax: number
      residentTax: number
      businessTax: number
      extraDedTotal: number
      deductionTotal: number      // 공제합계
      netPay: number              // 실지급액
      payDate: string
      isPaid: boolean
      account: string             // "은행 계좌"
      note: string                // 관리자 메모 + 지급/공제 세부
    }

    const buildDetail = (
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

      const { bank, number } = parseAccount(accountRaw)
      const account = bank ? `${bank} ${number}` : number

      return {
        name,
        roleLabel,
        employmentType,
        taxType,
        salaryBasis,
        workDays,
        jobCount,
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
        account,
        note: parts.join(' | '),
      }
    }

    const managerDetails: DetailRow[] = managerEntries.map(e => {
      const linked = userTaxMap.get(e.person.id)
      const workDays = new Set(e.jobs.map(j => j.construction_date)).size
      const roleLabel = e.person.role === 'admin' ? '관리자' : '직원'
      const employmentType = linked?.employmentType ?? roleLabel
      const payDate = payDateMap.get(`user:${e.person.id}`) ?? fallbackPayDate
      return buildDetail(
        e.person.name, roleLabel, employmentType,
        linked?.taxType ?? '4대보험',
        linked?.salaryBasis ?? '세전',
        workDays, e.jobs.length, e.autoAmount, e.record,
        e.person.account_number, payDate,
      )
    })

    const workerDetails: DetailRow[] = workerEntries.map(e => {
      const workDays = new Set(e.jobs.map(j => j.construction_date)).size
      const payDate = payDateMap.get(`worker:${e.person.id}`) ?? fallbackPayDate
      return buildDetail(
        e.person.name, '작업자', e.person.employment_type ?? '-',
        (e.person.tax_type as TaxType) ?? '없음',
        (e.person.salary_basis as SalaryBasis) ?? '세전',
        workDays, e.jobs.length, e.autoAmount, e.record,
        e.person.account_number, payDate,
      )
    })

    // ─── 시트 1: 급여명세 상세 (회계사용, 25열) ─────────────────────────────
    const HEADERS = [
      '성명', '역할', '고용형태', '세금유형', '급여기준',
      '근무일수', '근무건수',
      '기본급', '상여금', '식대', '교통비', '기타수당', '기타지급', '지급합계',
      '국민연금', '건강보험', '장기요양', '고용보험', '소득세', '지방소득세', '사업소득세', '추가공제', '공제합계',
      '실지급액', '지급일', '지급완료', '계좌', '비고',
    ]

    const detailToRow = (d: DetailRow): (string | number)[] => [
      d.name, d.roleLabel, d.employmentType, d.taxType, d.salaryBasis,
      d.workDays, d.jobCount,
      d.basePay, d.bonus, d.meal, d.car, d.otherAllowance, d.otherPay, d.grossTotal,
      d.nationalPension, d.healthInsurance, d.longtermCare, d.employmentInsurance,
      d.incomeTax, d.residentTax, d.businessTax, d.extraDedTotal, d.deductionTotal,
      d.netPay, d.payDate, d.isPaid ? '○' : '×', d.account, d.note,
    ]

    const sumBy = (rows: DetailRow[], key: keyof DetailRow) =>
      rows.reduce((s, r) => s + (typeof r[key] === 'number' ? (r[key] as number) : 0), 0)

    const totalGross = sumBy(managerDetails, 'grossTotal') + sumBy(workerDetails, 'grossTotal')
    const totalDed = sumBy(managerDetails, 'deductionTotal') + sumBy(workerDetails, 'deductionTotal')
    const totalNet = sumBy(managerDetails, 'netPay') + sumBy(workerDetails, 'netPay')
    const totalHead = managerDetails.length + workerDetails.length

    const detailRows: (string | number)[][] = [
      [`BBK 급여명세 상세 - ${monthLabel}`],
      [
        `발행일: ${new Date().toISOString().slice(0, 10)}`,
        `총 ${totalHead}명`,
        `지급합계 ${totalGross.toLocaleString('ko-KR')}원`,
        `공제합계 ${totalDed.toLocaleString('ko-KR')}원`,
        `실지급합계 ${totalNet.toLocaleString('ko-KR')}원`,
      ],
      [`※ 소득세는 요율 페이지의 근로소득세율(${(rates.incomeTax * 100).toFixed(2)}%) × 지급총액으로 자동 계산됩니다.`],
      [],
    ]

    if (managerDetails.length > 0) {
      detailRows.push([`[ 담당자 ${managerDetails.length}명 ]`])
      detailRows.push(HEADERS)
      for (const d of managerDetails) detailRows.push(detailToRow(d))
      detailRows.push([
        '담당자 합계', '', '', '', '',
        sumBy(managerDetails, 'workDays'), sumBy(managerDetails, 'jobCount'),
        sumBy(managerDetails, 'basePay'), sumBy(managerDetails, 'bonus'),
        sumBy(managerDetails, 'meal'), sumBy(managerDetails, 'car'),
        sumBy(managerDetails, 'otherAllowance'), sumBy(managerDetails, 'otherPay'),
        sumBy(managerDetails, 'grossTotal'),
        sumBy(managerDetails, 'nationalPension'), sumBy(managerDetails, 'healthInsurance'),
        sumBy(managerDetails, 'longtermCare'), sumBy(managerDetails, 'employmentInsurance'),
        sumBy(managerDetails, 'incomeTax'), sumBy(managerDetails, 'residentTax'),
        sumBy(managerDetails, 'businessTax'), sumBy(managerDetails, 'extraDedTotal'),
        sumBy(managerDetails, 'deductionTotal'),
        sumBy(managerDetails, 'netPay'), '', '', '', '',
      ])
      detailRows.push([])
    }

    if (workerDetails.length > 0) {
      detailRows.push([`[ 작업자 ${workerDetails.length}명 ]`])
      detailRows.push(HEADERS)
      for (const d of workerDetails) detailRows.push(detailToRow(d))
      detailRows.push([
        '작업자 합계', '', '', '', '',
        sumBy(workerDetails, 'workDays'), sumBy(workerDetails, 'jobCount'),
        sumBy(workerDetails, 'basePay'), sumBy(workerDetails, 'bonus'),
        sumBy(workerDetails, 'meal'), sumBy(workerDetails, 'car'),
        sumBy(workerDetails, 'otherAllowance'), sumBy(workerDetails, 'otherPay'),
        sumBy(workerDetails, 'grossTotal'),
        sumBy(workerDetails, 'nationalPension'), sumBy(workerDetails, 'healthInsurance'),
        sumBy(workerDetails, 'longtermCare'), sumBy(workerDetails, 'employmentInsurance'),
        sumBy(workerDetails, 'incomeTax'), sumBy(workerDetails, 'residentTax'),
        sumBy(workerDetails, 'businessTax'), sumBy(workerDetails, 'extraDedTotal'),
        sumBy(workerDetails, 'deductionTotal'),
        sumBy(workerDetails, 'netPay'), '', '', '', '',
      ])
      detailRows.push([])
    }

    detailRows.push([
      '총 합계', '', '', '', '',
      '', '',
      '', '', '', '', '', '', totalGross,
      '', '', '', '', '', '', '', '', totalDed,
      totalNet, '', '', '', '',
    ])

    const workbook = XLSX.utils.book_new()
    const detailSheet = XLSX.utils.aoa_to_sheet(detailRows)
    detailSheet['!cols'] = [
      { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 8 },
      { wch: 8 }, { wch: 8 },
      { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 22 }, { wch: 40 },
    ]
    XLSX.utils.book_append_sheet(workbook, detailSheet, '급여상세')

    // ─── 시트 2: 은행 급여이체 (obiz 포맷) ─────────────────────────────────
    // A: 은행명 · B: 계좌번호 · C: 이체금액(실지급액) · D: 예금주 · E: 통장표시 · F: 내 메모 · G: 메모
    const bankRows: (string | number)[][] = []
    const pushBankRow = (name: string, accRaw: string | null, amount: number) => {
      const { bank, number } = parseAccount(accRaw)
      bankRows.push([bank, number, amount, name, '급여', payLabel, ''])
    }
    for (const d of managerDetails) {
      const raw = managerEntries.find(e => e.person.name === d.name)?.person.account_number ?? null
      pushBankRow(d.name, raw, d.netPay)
    }
    for (const d of workerDetails) {
      const raw = workerEntries.find(e => e.person.name === d.name)?.person.account_number ?? null
      pushBankRow(d.name, raw, d.netPay)
    }

    const bankSheet = XLSX.utils.aoa_to_sheet(bankRows)
    bankSheet['!cols'] = [
      { wch: 8 }, { wch: 22 }, { wch: 12 }, { wch: 10 }, { wch: 6 }, { wch: 10 }, { wch: 10 },
    ]
    XLSX.utils.book_append_sheet(workbook, bankSheet, '급여이체')

    // ─── 파일 반환 ─────────────────────────────────────────────────────────
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    const fileName = `BBK_급여정산_${month}.xlsx`
    const encodedName = encodeURIComponent(fileName)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}`,
      },
    })
  } catch (err) {
    console.error('급여정산 엑셀 생성 실패:', err)
    return NextResponse.json({ error: '엑셀 생성에 실패했습니다.' }, { status: 500 })
  }
}
