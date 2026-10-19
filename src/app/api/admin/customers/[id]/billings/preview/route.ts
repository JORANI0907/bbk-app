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

/** 2026-10-19: 사장님이 모달 1단계에서 설정한 생성 범위로 필터 (fromPeriod/toPeriod 모두 'YYYY-MM' 형식) */
function filterByPeriodRange<T extends { billing_period: string }>(items: T[], fromPeriod?: string, toPeriod?: string): T[] {
  if (!fromPeriod && !toPeriod) return items
  const fromYear = fromPeriod?.slice(0, 4)
  const toYear = toPeriod?.slice(0, 4)
  return items.filter(s => {
    const sYear = s.billing_period.slice(0, 4)
    // 연간 레코드 (billing_period='2026'): 년도만 비교
    if (s.billing_period.length === 4) {
      if (fromYear && sYear < fromYear) return false
      if (toYear && sYear > toYear) return false
      return true
    }
    // 월간 레코드 ('2026-10'): 'YYYY-MM' 문자열 비교
    if (fromPeriod && s.billing_period < fromPeriod) return false
    if (toPeriod && s.billing_period > toPeriod) return false
    return true
  })
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = createServiceClient()

  const body = await request.json().catch(() => ({})) as { fromPeriod?: string; toPeriod?: string }
  const { fromPeriod, toPeriod } = body

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
    // 2026-10-19: 사장님 로직 — 계약기간보다 모달 범위(fromPeriod/toPeriod)가 우선
    fromPeriod,
    toPeriod,
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

  // 2026-10-19: 범위는 generator 가 이미 적용. filterByPeriodRange 는 안전망으로만 유지.
  const items = filterByPeriodRange(
    schedule.map(s => {
      const existingRow = existingMap.get(s.billing_period)
      return {
        billing_type: s.billing_type,
        billing_period: s.billing_period,
        due_date: s.due_date,
        amount: s.amount,
        service_type: customer.customer_type,
        billing_timing: timing,
        existing_status: existingRow?.status ?? null,
        existing_due_date: existingRow?.due_date ?? null,
      }
    }),
    fromPeriod,
    toPeriod,
  )

  return NextResponse.json({
    schedule: items,
    total_available: items.length,
    customer_name: customer.business_name,
    customer_type: customer.customer_type,
    billing_cycle: customer.billing_cycle,
    billing_timing: timing,
    contract_start_date: customer.contract_start_date,
    contract_end_date: customer.contract_end_date,
  })
}
