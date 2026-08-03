import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { calculatePayroll } from '@/lib/payroll/engine'
import { fetchRatesForPeriod } from '@/lib/payroll/rates'
import type { PayrollInput } from '@/lib/payroll/types'

/**
 * 임금 계산 미리보기 (DB 저장 없음)
 * POST /api/admin/payroll/calculate
 *
 * Body: PayrollInput 전체 + { workerId?: string }
 * Response: PayrollResult + snapshot_rates
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as PayrollInput & { workerId?: string }

    if (!body.employmentType) {
      return NextResponse.json({ error: 'employmentType이 필요합니다.' }, { status: 400 })
    }
    if (!body.payPeriod?.year || !body.payPeriod?.month) {
      return NextResponse.json({ error: 'payPeriod (year, month)가 필요합니다.' }, { status: 400 })
    }

    // workerId 제공 시 DB에서 직원 기본값 보완
    let input: PayrollInput = body
    if (body.workerId) {
      const supabase = createServiceClient()
      const { data: worker } = await supabase
        .from('workers')
        .select('contracted_monthly_hours, contracted_weekly_hours, dependents, enrolled_national_pension, enrolled_health_insurance, enrolled_employment_insurance')
        .eq('id', body.workerId)
        .single()

      if (worker) {
        input = {
          ...body,
          contractedMonthlyHours: body.contractedMonthlyHours ?? worker.contracted_monthly_hours ?? undefined,
          contractedWeeklyHours:  body.contractedWeeklyHours  ?? worker.contracted_weekly_hours  ?? undefined,
          dependents:             body.dependents             ?? worker.dependents                ?? 1,
          enrolledNationalPension:    body.enrolledNationalPension    ?? worker.enrolled_national_pension    ?? true,
          enrolledHealthInsurance:    body.enrolledHealthInsurance    ?? worker.enrolled_health_insurance    ?? true,
          enrolledEmploymentInsurance: body.enrolledEmploymentInsurance ?? worker.enrolled_employment_insurance ?? true,
        }
      }
    }

    const rates = await fetchRatesForPeriod(body.payPeriod.year, body.payPeriod.month)
    const result = calculatePayroll(input, rates)

    return NextResponse.json({ success: true, data: { ...result, snapshot_rates: rates } })
  } catch (err) {
    console.error('[payroll/calculate] 계산 실패:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '계산 실패' },
      { status: 500 },
    )
  }
}
