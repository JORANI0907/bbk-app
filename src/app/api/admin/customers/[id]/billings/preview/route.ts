import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateBillingSchedule, computeBillingAmountFromCustomer } from '@/lib/billing-generator'

/**
 * 결제청구 생성 미리보기 (2026-10-19 Phase B)
 *
 * 사장님이 고객 모달의 [결제청구 생성] 버튼을 누르면 이 API 가 호출됨.
 * - DB 변경 없음 (조회·계산만)
 * - 생성될 billing 리스트와 각 레코드의 "이미 존재" 여부를 반환
 * - 사장님이 모달에서 체크박스로 생성 대상을 선택
 */

type Params = { params: Promise<{ id: string }> }

export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = createServiceClient()

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
  })

  if (schedule.length === 0) {
    return NextResponse.json({
      schedule: [],
      message: '생성 조건 미충족: 결제주기 · 결제방식 · 계약기간 · 공급가액(총액)이 모두 설정되어 있는지 확인해주세요.',
    })
  }

  // 기존 service_billings 조회 (status 포함)
  const { data: existing } = await supabase
    .from('service_billings')
    .select('billing_period, status, due_date, amount')
    .eq('customer_id', id)

  const existingMap = new Map<string, { status: string | null; due_date: string | null; amount: number | null }>(
    (existing ?? []).map(e => [
      e.billing_period as string,
      {
        status: (e.status ?? null) as string | null,
        due_date: (e.due_date ?? null) as string | null,
        amount: (e.amount ?? null) as number | null,
      },
    ])
  )

  const items = schedule.map(s => {
    const existingRow = existingMap.get(s.billing_period)
    return {
      billing_type: s.billing_type,
      billing_period: s.billing_period,
      due_date: s.due_date,
      amount: s.amount,
      service_type: customer.customer_type,
      billing_timing: timing,
      // 기존 상태 표시용 (사용자가 중복 여부를 UI에서 바로 확인)
      existing_status: existingRow?.status ?? null,
      existing_due_date: existingRow?.due_date ?? null,
    }
  })

  return NextResponse.json({
    schedule: items,
    customer_name: customer.business_name,
    customer_type: customer.customer_type,
    billing_cycle: customer.billing_cycle,
    billing_timing: timing,
  })
}
