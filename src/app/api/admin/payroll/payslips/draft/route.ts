import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { calculatePayroll } from '@/lib/payroll/engine'
import { fetchRatesForPeriod } from '@/lib/payroll/rates'
import type { PayrollInput } from '@/lib/payroll/types'

/**
 * DRAFT 명세서 생성 (계산 + 스냅샷 저장)
 * POST /api/admin/payroll/payslips/draft
 *
 * Body: {
 *   workerId: string       (workers.id)
 *   input: PayrollInput    (계산 입력값)
 * }
 *
 * 스냅샷: 생성 시점 요율과 입력값을 payroll_payslips.snapshot_* 에 저장.
 * 이후 요율이 바뀌어도 과거 명세서를 그대로 재현할 수 있다.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { workerId: string; input: PayrollInput }
    const { workerId, input } = body

    if (!workerId) {
      return NextResponse.json({ error: 'workerId가 필요합니다.' }, { status: 400 })
    }
    if (!input?.employmentType || !input?.payPeriod) {
      return NextResponse.json({ error: 'input.employmentType / payPeriod가 필요합니다.' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // 직원 인적사항 조회
    const { data: worker, error: workerErr } = await supabase
      .from('workers')
      .select('id, name, year_month')
      .eq('id', workerId)
      .single()

    if (workerErr || !worker) {
      return NextResponse.json({ error: '직원을 찾을 수 없습니다.' }, { status: 404 })
    }

    // 동일 귀속월 DRAFT 중복 방지
    const yearMonth = `${input.payPeriod.year}-${String(input.payPeriod.month).padStart(2, '0')}`
    const { data: existing } = await supabase
      .from('payroll_payslips')
      .select('id, status')
      .eq('person_id', workerId)
      .eq('year_month', yearMonth)
      .in('status', ['DRAFT', 'CONFIRMED'])
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: `${yearMonth} 귀속 명세서가 이미 존재합니다 (${existing.status}).` },
        { status: 409 },
      )
    }

    // 요율 조회 → 계산
    const rates = await fetchRatesForPeriod(input.payPeriod.year, input.payPeriod.month)
    const result = calculatePayroll(input, rates)

    // calcMethod 문자열 맵 (법정 필수 기재사항 5번 항목)
    const calcMethodStrings: Record<string, string> = {}
    for (const item of result.payItems) {
      calcMethodStrings[item.key] = item.calcMethod
    }
    for (const item of result.deductItems) {
      calcMethodStrings[item.key] = item.calcMethod
    }

    // 저장
    const { data: payslip, error: insertErr } = await supabase
      .from('payroll_payslips')
      .insert({
        year_month:      yearMonth,
        person_type:     'worker',
        person_id:       workerId,
        person_name:     worker.name,
        pay_date:        input.paymentDate,
        employment_type: input.employmentType,
        gross_amount:    result.grossPay,
        deduction_amount: result.totalDeduction,
        net_amount:      result.netPay,
        status:          'DRAFT',
        snapshot_rates:  rates,
        snapshot_input:  input,
        pay_items:       result.payItems,
        deduct_items:    result.deductItems,
        calc_method_strings: calcMethodStrings,
      })
      .select()
      .single()

    if (insertErr) throw new Error(insertErr.message)

    return NextResponse.json(
      { success: true, payslip, result, warnings: result.warnings },
      { status: 201 },
    )
  } catch (err) {
    console.error('[payslips/draft] 생성 실패:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '명세서 생성 실패' },
      { status: 500 },
    )
  }
}
