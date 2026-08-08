import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { computePayslip, type TaxType, type SalaryBasis } from '@/lib/payroll/payslipCalc'

/**
 * 급여명세서 데이터 API
 * POST /api/admin/payroll/payslip-data
 *
 * 요청: { month: "2026-07", personType: "user"|"worker", personId, payDate, incomeTax? }
 * 응답: 급여명세서 렌더링에 필요한 통합 JSON (인적사항 + 근무내역 + 지급/공제/실지급)
 * 계산 로직은 lib/payroll/payslipCalc.ts 에 집중되어 있어 export API 등과 정합성이 보장된다.
 */

function getMonthEndDate(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  return `${yearMonth}-${String(lastDay).padStart(2, '0')}`
}

function generateEmployeeNumber(personId: string): string {
  return `BBK-${personId.slice(0, 4).toUpperCase()}`
}

// 주민번호 뒷자리(성별 코드) 1자리만 노출하고 나머지는 마스킹
function maskResidentNumber(rrn: string | null | undefined): string {
  if (!rrn) return '-'
  const cleaned = rrn.replace(/-/g, '')
  if (cleaned.length < 7) return '-'
  return `${cleaned.slice(0, 6)}-${cleaned[6]}******`
}


export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      month,
      personType,
      personId,
      payDate,
      incomeTax = 0,
    } = body as {
      month?: string
      personType?: 'user' | 'worker'
      personId?: string
      payDate?: string
      incomeTax?: number
    }

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'month (YYYY-MM)가 필요합니다.' }, { status: 400 })
    }
    if (personType !== 'user' && personType !== 'worker') {
      return NextResponse.json({ error: 'personType은 user 또는 worker 여야 합니다.' }, { status: 400 })
    }
    if (!personId) {
      return NextResponse.json({ error: 'personId가 필요합니다.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const periodStart = `${month}-01`
    const periodEnd = getMonthEndDate(month)

    // 인적사항 조회
    let person: {
      id: string
      name: string
      taxType: TaxType
      salaryBasis: SalaryBasis
      accountNumber: string | null
      residentNumberMasked: string
      department: string | null
      position: string | null
      joinDate: string | null
      employmentType: string | null
      birthDate: string | null
      phone: string | null
      email: string | null
      homeAddress: string | null
    }

    if (personType === 'user') {
      // 담당자(users) 조회
      const { data, error } = await supabase
        .from('users')
        .select('id, name, role, phone, email, account_number, resident_number')
        .eq('id', personId)
        .single()
      if (error || !data) {
        return NextResponse.json({ error: '담당자를 찾을 수 없습니다.' }, { status: 404 })
      }

      // users → workers 매핑이 있으면 workers의 상세 정보를 우선 사용
      const { data: linkedWorker } = await supabase
        .from('workers')
        .select('tax_type, salary_basis, employment_type, department, position, job_title, join_date, birth_date, home_address, personal_id, resident_number')
        .eq('user_id', personId)
        .maybeSingle()

      const rrn = linkedWorker?.resident_number ?? linkedWorker?.personal_id ?? data.resident_number

      person = {
        id: data.id,
        name: data.name,
        taxType: (linkedWorker?.tax_type as TaxType) ?? '4대보험',
        salaryBasis: (linkedWorker?.salary_basis as SalaryBasis) ?? '세전',
        accountNumber: data.account_number,
        residentNumberMasked: maskResidentNumber(rrn),
        department: linkedWorker?.department ?? null,
        position: linkedWorker?.position ?? linkedWorker?.job_title ?? (data.role === 'admin' ? '관리자' : '직원'),
        joinDate: linkedWorker?.join_date ?? null,
        employmentType: linkedWorker?.employment_type ?? (data.role === 'admin' ? '관리자' : '직원'),
        birthDate: linkedWorker?.birth_date ?? null,
        phone: data.phone,
        email: data.email,
        homeAddress: linkedWorker?.home_address ?? null,
      }
    } else {
      const { data, error } = await supabase
        .from('workers')
        .select('id, name, tax_type, salary_basis, employment_type, phone, email, account_number, resident_number, personal_id, birth_date, department, position, job_title, join_date, home_address')
        .eq('id', personId)
        .single()
      if (error || !data) {
        return NextResponse.json({ error: '작업자를 찾을 수 없습니다.' }, { status: 404 })
      }
      const rrn = data.resident_number ?? data.personal_id
      person = {
        id: data.id,
        name: data.name,
        taxType: (data.tax_type as TaxType) ?? '없음',
        salaryBasis: (data.salary_basis as SalaryBasis) ?? '세전',
        accountNumber: data.account_number,
        residentNumberMasked: maskResidentNumber(rrn),
        department: data.department,
        position: data.position ?? data.job_title,
        joinDate: data.join_date,
        employmentType: data.employment_type,
        birthDate: data.birth_date,
        phone: data.phone,
        email: data.email,
        homeAddress: data.home_address,
      }
    }

    // 지급 총액 조회 (payroll_records)
    const { data: recordRow } = await supabase
      .from('payroll_records')
      .select('auto_amount, final_amount, note, is_paid, paid_at, extra_items, extra_deductions')
      .eq('year_month', month)
      .eq('person_type', personType)
      .eq('person_id', personId)
      .maybeSingle()

    // 근무 내역 조회
    let jobs: { date: string; businessName: string; serviceType: string | null; amount: number }[] = []
    let gross = 0

    if (personType === 'user') {
      // 담당자로 배정된 service_applications
      const { data: apps } = await supabase
        .from('service_applications')
        .select('id, business_name, service_type, construction_date, manager_pay, unit_price_per_visit')
        .eq('assigned_to', personId)
        .is('deleted_at', null)
        .gte('construction_date', periodStart)
        .lte('construction_date', periodEnd)
        .order('construction_date')

      const { data: prices } = await supabase
        .from('unit_price_monthly')
        .select('application_id, unit_price')
        .eq('year_month', month)
      const monthlyPriceMap = new Map<string, number>((prices ?? []).map(p => [p.application_id, p.unit_price]))

      for (const app of apps ?? []) {
        const monthlyPrice = monthlyPriceMap.get(app.id) ?? null
        const pay = (app.manager_pay ?? monthlyPrice ?? app.unit_price_per_visit) ?? 0
        jobs.push({
          date: app.construction_date,
          businessName: app.business_name,
          serviceType: app.service_type,
          amount: pay,
        })
        gross += pay
      }
    } else {
      const { data: assigns } = await supabase
        .from('work_assignments')
        .select('id, business_name, construction_date, salary')
        .eq('worker_id', personId)
        .gte('construction_date', periodStart)
        .lte('construction_date', periodEnd)
        .order('construction_date')

      for (const a of assigns ?? []) {
        jobs.push({
          date: a.construction_date,
          businessName: a.business_name,
          serviceType: null,
          amount: a.salary ?? 0,
        })
        gross += a.salary ?? 0
      }
    }

    // 추가 지급 항목
    const extraItems: { label: string; amount: number }[] =
      Array.isArray(recordRow?.extra_items) ? (recordRow.extra_items as { label: string; amount: number }[]) : []

    // 추가 공제 항목 (손망실, 선지급 회수 등 — netPay에서 차감됨)
    const extraDeductions: { label: string; amount: number }[] =
      Array.isArray(recordRow?.extra_deductions) ? (recordRow.extra_deductions as { label: string; amount: number }[]) : []

    const workDays = new Set(jobs.map(j => j.date)).size

    // 공용 계산 함수로 위임 (lib/payroll/payslipCalc.ts)
    const calc = computePayslip({
      autoAmount: gross,
      finalAmount: recordRow?.final_amount ?? null,
      extraItems,
      extraDeductions,
      taxType: person.taxType,
      salaryBasis: person.salaryBasis,
      incomeTax,
    })

    return NextResponse.json({
      success: true,
      data: {
        month,
        payDate: payDate ?? null,
        extraItems,
        extraDeductions,
        person: {
          type: personType,
          id: person.id,
          employeeNumber: generateEmployeeNumber(person.id),
          name: person.name,
          birthDate: person.birthDate,
          residentNumberMasked: person.residentNumberMasked,
          department: person.department,
          position: person.position,
          joinDate: person.joinDate,
          employmentType: person.employmentType,
          taxType: person.taxType,
          salaryBasis: person.salaryBasis,
          accountNumber: person.accountNumber,
          phone: person.phone,
          email: person.email,
          homeAddress: person.homeAddress,
        },
        workSummary: {
          workDays,
          jobCount: jobs.length,
          periodStart,
          periodEnd,
        },
        jobs,
        gross: {
          autoAmount: gross,
          bookedAmount: calc.bookedAmount,
          basePay: calc.basePay,
          finalAmount: calc.grossTotal,
          isAdjusted: calc.isAdjusted,
          isNetBasis: calc.isNetBasis,
          note: recordRow?.note ?? null,
          isPaid: recordRow?.is_paid ?? false,
        },
        deductions: calc.deductions,
        netPay: calc.netPay,
      },
    })
  } catch (err) {
    console.error('급여명세서 데이터 생성 실패:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '데이터 조회 실패' },
      { status: 500 },
    )
  }
}
