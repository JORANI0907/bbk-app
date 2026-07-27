import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { UNCLASSIFIED } from '@/lib/finance-types'

// GET /api/admin/finance?month=YYYY-MM
export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month')

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month 파라미터가 필요합니다. (YYYY-MM)' }, { status: 400 })
  }

  const nextMonth = (() => {
    const [y, m] = month.split('-').map(Number)
    return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  })()

  const [appsRes, payrollRes, fixedRes, variableRes, endCareRes, deepCareAnnualRes] = await Promise.all([
    // 매출: 해당 월 service_applications (정기엔드케어 및 미진행 상태 제외)
    // Phase 22 v13-c: 정기딥 연간 계약의 개별 방문 제외 위해 customers.billing_cycle JOIN → 후처리에서 필터
    // Phase 23: customer.status='paused' 필터 (일시정지 고객 매출 제외)
    supabase
      .from('service_applications')
      .select('id, business_name, supply_amount, vat, payment_method, service_type, construction_date, customer_id, customers(billing_cycle, customer_type, status)')
      .gte('construction_date', `${month}-01`)
      .lt('construction_date', nextMonth)
      .not('supply_amount', 'is', null)
      .neq('service_type', '정기엔드케어')
      .not('status', 'in', '("신규","견적발송","방문견적","예약취소","예약금환급완료")')
      .is('deleted_at', null)
      .order('construction_date'),

    // 인건비: 해당 월 payroll_records
    supabase
      .from('payroll_records')
      .select('id, person_type, person_id, auto_amount, final_amount, is_paid')
      .eq('year_month', month),

    // 고정비
    supabase
      .from('finance_records')
      .select('*')
      .eq('year_month', month)
      .eq('category', 'fixed')
      .order('created_at'),

    // 변동비
    supabase
      .from('finance_records')
      .select('*')
      .eq('year_month', month)
      .eq('category', 'variable')
      .order('created_at'),

    // 정기엔드케어 매출: service_billings 테이블에서 해당 월 결제완료 이력 조회
    // Phase 22 v13: paid_date·due_date 필드도 select → 매출 상세 리스트 결제일자 노출
    // Phase 23: status='paused' 고객 제외 (JOIN 조건 + customer.status 필터)
    supabase
      .from('service_billings')
      .select('id, amount, customer_id, paid_date, due_date, customers!inner(id, business_name, payment_method, customer_type, status, deleted_at)')
      .eq('billing_period', month)
      .eq('status', 'paid')
      .eq('billing_type', 'monthly')
      .eq('customers.customer_type', '정기엔드케어')
      .neq('customers.status', 'paused')
      .is('customers.deleted_at', null),

    // 정기딥케어 연간: 계약 기간이 해당 월과 겹치는 모든 고객
    // Phase 23-b: 계약 시작 월 = 총액 계상 / 그 외 월 = 리스트 노출만 (total=0)
    supabase
      .from('customers')
      .select('id, business_name, billing_amount, payment_method, contract_start_date, contract_end_date')
      .eq('customer_type', '정기딥케어')
      .eq('billing_cycle', '연간')
      .neq('status', 'paused')
      .lte('contract_start_date', `${month}-31`)
      .gte('contract_end_date', `${month}-01`)
      .not('billing_amount', 'is', null)
      .is('deleted_at', null),
  ])

  if (appsRes.error) return NextResponse.json({ error: appsRes.error.message }, { status: 500 })
  if (payrollRes.error) return NextResponse.json({ error: payrollRes.error.message }, { status: 500 })
  if (fixedRes.error) return NextResponse.json({ error: fixedRes.error.message }, { status: 500 })
  if (variableRes.error) return NextResponse.json({ error: variableRes.error.message }, { status: 500 })
  // endCareRes 오류는 무시 (테이블이 없을 수도 있음)

  const apps = appsRes.data ?? []
  const payrolls = payrollRes.data ?? []
  const fixedRecords = fixedRes.data ?? []
  const variableRecords = variableRes.data ?? []
  const deepCareAnnualCustomers = deepCareAnnualRes.data ?? []

  // 부가세 미적용 여부: '비과세' 또는 '미희망' 키워드 포함 시 (legacy '현금(부가세 X)' 포함)
  const isNoVat = (method: string | null) =>
    !!method && (method.includes('비과세') || method.includes('미희망') || method === '현금(부가세 X)')

  // 서비스관리 매출 계산
  // Phase 22 v13-c: 정기딥 연간 방문은 별도 deepCareAnnualItems로 계상하므로 apps에서 제외 (중복 방지)
  // Phase 23: 일시정지(status='paused') 고객 방문도 매출에서 제외
  type AppRow = typeof apps[number] & { customers?: { billing_cycle: string | null; customer_type: string | null; status: string | null } | Array<{ billing_cycle: string | null; customer_type: string | null; status: string | null }> }
  const revenueItems = (apps as AppRow[])
    .filter(a => {
      const c = Array.isArray(a.customers) ? a.customers[0] : a.customers
      if (c?.status === 'paused') return false
      if (a.service_type === '정기딥케어' && c?.billing_cycle === '연간') return false
      return true
    })
    .map(a => {
      const total = (a.supply_amount ?? 0) + (isNoVat(a.payment_method) ? 0 : (a.vat ?? 0))
      return {
        id: a.id,
        business_name: a.business_name,
        supply_amount: a.supply_amount,
        vat: a.vat,
        payment_method: a.payment_method,
        service_type: a.service_type,
        construction_date: a.construction_date,
        total,
      }
    })

  // 정기엔드케어 매출 (service_billings 결제완료 이력 기반)
  // Phase 22 v13: 결제일자는 paid_date 우선, 없으면 due_date로 대체 → 매출 상세 리스트 표시
  // Phase 22 v13-b: supabase !inner join은 단일 객체로 오지만 타입은 배열로 잡음 → Array.isArray 방어
  type EndCareCustomer = { id: string; business_name: string; payment_method: string | null; customer_type: string; deleted_at: string | null }
  type EndCareRaw = { id: string; amount: number; customer_id: string; paid_date: string | null; due_date: string | null; customers: EndCareCustomer | EndCareCustomer[] }
  const endCareItems = ((endCareRes.data ?? []) as unknown as EndCareRaw[]).map(b => {
    const customer = Array.isArray(b.customers) ? b.customers[0] : b.customers
    const supply = b.amount ?? 0
    const vatAmt = isNoVat(customer?.payment_method ?? null) ? 0 : Math.round(supply * 0.1)
    return {
      id: b.id,
      business_name: customer?.business_name ?? '알 수 없음',
      service_type: '정기엔드케어',
      construction_date: b.paid_date ?? b.due_date ?? null,
      supply_amount: supply,
      vat: vatAmt,
      payment_method: customer?.payment_method ?? null,
      total: supply + vatAmt,
    }
  })

  // 정기딥케어 연간 매출 (Phase 23-b 하이브리드):
  // - 계약 시작 월인 고객: 총액 계상 (billing_amount + 부가세)
  // - 계약 진행중이지만 시작월 아님: 리스트에만 노출 (total=0 → 총액 자동 제외)
  const deepCareAnnualItems = deepCareAnnualCustomers.map(c => {
    const supply = c.billing_amount ?? 0
    const vatAmt = isNoVat(c.payment_method) ? 0 : Math.round(supply * 0.1)
    const isStartMonth = c.contract_start_date?.slice(0, 7) === month
    return {
      id: c.id,
      business_name: c.business_name,
      service_type: isStartMonth ? '정기딥케어(연간)' : '정기딥케어(연간·진행중)',
      construction_date: c.contract_start_date,
      supply_amount: isStartMonth ? supply : 0,
      vat: isStartMonth ? vatAmt : 0,
      payment_method: c.payment_method as string | null,
      total: isStartMonth ? supply + vatAmt : 0,
    }
  })

  const allRevenueItems = [...revenueItems, ...endCareItems, ...deepCareAnnualItems]
  const revenueTotal = allRevenueItems.reduce((s, a) => s + a.total, 0)

  // 인건비 계산
  const laborTotal = payrolls.reduce((s, r) => s + (r.final_amount ?? r.auto_amount), 0)

  // 고정비 합계
  const fixedTotal = fixedRecords.reduce((s, r) => s + Number(r.amount), 0)

  // 변동비 합계
  const variableTotal = variableRecords.reduce((s, r) => s + Number(r.amount), 0)

  // 순이익
  const netProfit = revenueTotal - laborTotal - fixedTotal - variableTotal

  return NextResponse.json({
    revenue: { total: revenueTotal, items: allRevenueItems },
    labor: { total: laborTotal, records: payrolls },
    fixed: { total: fixedTotal, records: fixedRecords },
    variable: { total: variableTotal, records: variableRecords },
    net_profit: netProfit,
  })
}

// POST /api/admin/finance — 고정비/변동비 항목 추가
// group_name 이 body 에 있으면 그대로 사용, 없으면 매핑 테이블에서 조회, 매칭 없으면 '미분류'
export async function POST(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()
  const { year_month, category, name, amount, note, group_name } = body

  if (!year_month || !category || !name) {
    return NextResponse.json({ error: 'year_month, category, name이 필요합니다.' }, { status: 400 })
  }
  if (!['fixed', 'variable'].includes(category)) {
    return NextResponse.json({ error: 'category는 fixed 또는 variable이어야 합니다.' }, { status: 400 })
  }

  // group_name 결정: body 우선 → 매핑 테이블 조회 → 미분류
  let resolvedGroup: string = UNCLASSIFIED
  if (typeof group_name === 'string' && group_name.trim()) {
    resolvedGroup = group_name
  } else {
    const { data: mapping } = await supabase
      .from('finance_type_mappings')
      .select('group_name')
      .eq('category', category)
      .eq('name', name)
      .maybeSingle()
    if (mapping?.group_name) resolvedGroup = mapping.group_name
  }

  const { data, error } = await supabase
    .from('finance_records')
    .insert({
      year_month,
      category,
      name,
      amount: amount ?? 0,
      note: note ?? null,
      group_name: resolvedGroup,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ record: data }, { status: 201 })
}

// PATCH /api/admin/finance — 항목 수정 (name / amount / note / group_name)
export async function PATCH(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()
  const { id, name, amount, note, group_name } = body

  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (name !== undefined) updates.name = name
  if (amount !== undefined) updates.amount = amount
  if (note !== undefined) updates.note = note
  if (group_name !== undefined) updates.group_name = group_name

  const { data, error } = await supabase
    .from('finance_records')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ record: data })
}

// DELETE /api/admin/finance?id=...
export async function DELETE(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

  const { error } = await supabase.from('finance_records').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
