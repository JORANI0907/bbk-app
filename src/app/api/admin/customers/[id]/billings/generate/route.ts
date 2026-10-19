import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateBillingSchedule, computeBillingAmountFromCustomer } from '@/lib/billing-generator'

/**
 * 결제청구 생성 (수동 트리거) + payment_url 동시 발급 (2026-10-19 Phase B)
 *
 * 사장님이 모달에서 체크 후 [확인하고 생성] 누르면 이 API 호출.
 *   1) 체크된 period 만 service_billings 에 INSERT
 *   2) 각 INSERT 직후 /api/portone/issue-billing-link 를 호출해서 payment_url 동시 발급
 *   3) 결과: inserted, skipped, generated_links 반환
 *
 * body:
 *   { periods?: string[],   // 선택된 billing_period 배열. 미전달이면 schedule 전체
 *     regenerate?: boolean  // true 면 선택된 period 의 pending 레코드 먼저 삭제 후 재생성 }
 */

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.bbkorea.co.kr'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = createServiceClient()

  const body = await request.json() as {
    periods?: string[]
    regenerate?: boolean
    // 2026-10-19 긴급: 모달에서 설정한 범위를 generator 에 전달해야
    //   preview 와 schedule 이 일치. 안 보내면 계약기간 안의 것만 생성됨.
    fromPeriod?: string
    toPeriod?: string
  }

  const { data: customer, error } = await supabase
    .from('customers')
    .select('id, business_name, customer_type, billing_cycle, billing_timing, supply_amount, vat, billing_amount, payment_method, payment_date, contract_start_date, contract_end_date, status')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error || !customer) {
    return NextResponse.json({ error: '고객을 찾을 수 없습니다' }, { status: 404 })
  }

  if (customer.status === 'paused') {
    return NextResponse.json({ error: '일시정지 상태인 고객은 결제청구를 생성할 수 없습니다' }, { status: 400 })
  }

  const amount = computeBillingAmountFromCustomer(customer)
  const timing = (customer.billing_timing ?? 'prepaid') as 'prepaid' | 'postpaid'

  const schedule = generateBillingSchedule({
    serviceType: customer.customer_type,
    billingCycle: customer.billing_cycle,
    contractStartDate: customer.contract_start_date,
    contractEndDate: customer.contract_end_date,
    paymentDay: customer.payment_date,
    billingAmount: amount,
    billingTiming: timing,
    // 2026-10-19 긴급: preview 와 동일 범위 적용
    fromPeriod: body.fromPeriod,
    toPeriod: body.toPeriod,
  })

  if (schedule.length === 0) {
    return NextResponse.json({
      error: '생성 조건 미충족 (결제주기·결제방식·계약기간·총액 확인)',
    }, { status: 400 })
  }

  // periods 로 필터 (미전달 시 전체)
  const selectedSet = body.periods && body.periods.length > 0 ? new Set(body.periods) : null
  const targetSchedule = selectedSet
    ? schedule.filter(s => selectedSet.has(s.billing_period))
    : schedule

  if (targetSchedule.length === 0) {
    return NextResponse.json({ inserted: 0, skipped: 0, generated_links: 0, message: '선택된 항목이 없습니다' })
  }

  // regenerate=true 면 선택된 period 의 pending 레코드 먼저 삭제 (paid 는 절대 건드리지 않음)
  if (body.regenerate) {
    const periodsToDelete = targetSchedule.map(s => s.billing_period)
    await supabase
      .from('service_billings')
      .delete()
      .eq('customer_id', id)
      .in('billing_period', periodsToDelete)
      .eq('status', 'pending')
  }

  // 멱등성: 이미 존재하는 period 조회 (regenerate 이후 paid 만 남아있음)
  const { data: existing } = await supabase
    .from('service_billings')
    .select('billing_period')
    .eq('customer_id', id)

  const existingSet = new Set((existing ?? []).map(e => e.billing_period as string))
  const toInsert = targetSchedule.filter(s => !existingSet.has(s.billing_period))
  const skipped = targetSchedule.length - toInsert.length

  if (toInsert.length === 0) {
    return NextResponse.json({ inserted: 0, skipped, generated_links: 0 })
  }

  const rows = toInsert.map(s => ({
    customer_id: id,
    billing_type: s.billing_type,
    billing_period: s.billing_period,
    amount: s.amount,
    due_date: s.due_date,
    status: 'pending' as const,
    service_type: customer.customer_type,
    billing_timing: timing,
  }))

  const { data: inserted, error: insertError } = await supabase
    .from('service_billings')
    .insert(rows)
    .select('id')

  if (insertError || !inserted) {
    return NextResponse.json(
      { error: `결제청구 생성 실패: ${insertError?.message ?? 'unknown'}` },
      { status: 500 },
    )
  }

  // 각 레코드에 대해 payment_url 발급 (병렬, 실패해도 레코드는 유지)
  const linkResults = await Promise.allSettled(
    inserted.map(async (row) => {
      const linkRes = await fetch(`${APP_BASE_URL}/api/portone/issue-billing-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billingId: row.id }),
      })
      return linkRes.ok
    })
  )
  const linkGenerated = linkResults.filter(r => r.status === 'fulfilled' && r.value === true).length

  return NextResponse.json({
    inserted: inserted.length,
    skipped,
    generated_links: linkGenerated,
    customer_name: customer.business_name,
  })
}
