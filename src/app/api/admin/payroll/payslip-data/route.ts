import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * 급여명세서 데이터 API
 * POST /api/admin/payroll/payslip-data
 *
 * 요청: { month: "2026-07", personType: "user"|"worker", personId, payDate, incomeTax? }
 * 응답: 급여명세서 렌더링에 필요한 통합 JSON (인적사항 + 근무내역 + 지급/공제/실지급)
 */

type TaxType = '4대보험' | '프리랜서3.3%' | '없음'
type SalaryBasis = '세전' | '세후'

// 2026년 기준 4대보험 근로자 부담 요율 (표준)
const RATE_NATIONAL_PENSION = 0.045      // 국민연금 4.5%
const RATE_HEALTH_INSURANCE = 0.03545    // 건강보험 3.545%
const RATE_LONGTERM_CARE    = 0.1295     // 장기요양보험 (건강보험료의 12.95%)
const RATE_EMPLOYMENT       = 0.009      // 고용보험 0.9%
const RATE_RESIDENT_TAX     = 0.1        // 지방소득세 (소득세의 10%)
const RATE_FREELANCE_TAX    = 0.03       // 사업소득세 3%
const RATE_FREELANCE_RESIDENT = 0.003    // 지방소득세 0.3%

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

/**
 * 세후 방식일 때, 책정된 net 금액으로부터 총 지급액(gross)을 역산.
 * - 프리랜서3.3%: gross = net / (1 - 0.033)
 * - 4대보험: gross = (net + incomeTax * (1 + 0.1)) / (1 - 0.09404)
 *   0.09404 = 국민연금(4.5%) + 건강보험(3.545%) + 장기요양(건강*12.95%) + 고용보험(0.9%)
 * - 없음: gross = net
 */
function reverseGrossFromNet(net: number, taxType: TaxType, incomeTax: number): number {
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
  return net
}

function calculateDeductions(gross: number, taxType: TaxType, incomeTax: number) {
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
  if (taxType === '프리랜서3.3%') {
    // 원단위 절사 → 실무에서는 십원 단위로 절사하는 경우가 많음
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
  // 없음
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
      .select('auto_amount, final_amount, note, is_paid, paid_at')
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

    // 책정된 금액 (자동 계산 or 관리자가 조정한 최종 금액)
    const bookedAmount = recordRow?.final_amount ?? gross
    const workDays = new Set(jobs.map(j => j.date)).size

    // 세후 방식이면 책정 금액을 실지급액으로 정확히 고정, 총 지급액은 (실지급 + 공제)로 역산
    // 세전 방식이면 책정 금액을 gross로 그대로 사용
    const isNetBasis = person.salaryBasis === '세후'
    let computedGross: number
    let deductions: ReturnType<typeof calculateDeductions>
    let netPay: number

    if (isNetBasis) {
      // 1) 근사 gross → 근사 공제 (표준 요율 십원 절사)
      const approxGross = reverseGrossFromNet(bookedAmount, person.taxType, incomeTax)
      const approxDeductions = calculateDeductions(approxGross, person.taxType, incomeTax)
      // 2) 실지급을 bookedAmount로 정확히 맞추기 위해 gross를 (실지급 + 공제)로 고정
      computedGross = bookedAmount + approxDeductions.total
      deductions = approxDeductions
      netPay = bookedAmount  // 사용자가 책정한 금액과 정확히 일치
    } else {
      computedGross = bookedAmount
      deductions = calculateDeductions(computedGross, person.taxType, incomeTax)
      netPay = computedGross - deductions.total
    }

    return NextResponse.json({
      success: true,
      data: {
        month,
        payDate: payDate ?? null,
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
          // 관리자가 급여정산 카드에서 책정한 금액 (세전이면 gross, 세후면 net)
          bookedAmount,
          // 실제 계산된 총 지급액 (세후일 때 역산됨)
          finalAmount: computedGross,
          isAdjusted: recordRow?.final_amount != null && recordRow.final_amount !== gross,
          isNetBasis,
          note: recordRow?.note ?? null,
          isPaid: recordRow?.is_paid ?? false,
        },
        deductions,
        netPay,
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
