import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/admin/finance?month=YYYY-MM
export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month')

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month 파라미터가 필요합니다. (YYYY-MM)' }, { status: 400 })
  }

  const monthNum = parseInt(month.split('-')[1], 10)
  const monthLabel = `${monthNum}월`

  const nextMonth = (() => {
    const [y, m] = month.split('-').map(Number)
    return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  })()

  const [appsRes, payrollRes, fixedRes, variableRes, endCareRes] = await Promise.all([
    // 매출: 해당 월 service_applications (정기엔드케어 제외)
    supabase
      .from('service_applications')
      .select('id, business_name, supply_amount, vat, payment_method, service_type, construction_date')
      .gte('construction_date', `${month}-01`)
      .lt('construction_date', nextMonth)
      .not('supply_amount', 'is', null)
      .neq('service_type', '정기엔드케어')
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

    // 정기엔드케어 매출: 고객관리 탭에서 이번달 결제현황 체크된 고객
    // payment_status는 jsonb 배열 → cs 연산자로 직접 필터링
    supabase
      .from('customers')
      .select('id, business_name, billing_amount, payment_method')
      .eq('customer_type', '정기엔드케어')
      .filter('payment_status', 'cs', `["${monthLabel}"]`)
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
  const endCareCustomers = endCareRes.data ?? []

  // 부가세 미적용 여부: '비과세' 또는 '미희망' 키워드 포함 시 (legacy '현금(부가세 X)' 포함)
  const isNoVat = (method: string | null) =>
    !!method && (method.includes('비과세') || method.includes('미희망') || method === '현금(부가세 X)')

  // 서비스관리 매출 계산
  const revenueItems = apps.map(a => {
    const total = (a.supply_amount ?? 0) + (isNoVat(a.payment_method) ? 0 : (a.vat ?? 0))
    return { ...a, total }
  })

  // 정기엔드케어 매출 (고객관리 탭 billing_amount + 결제방법별 부가세 처리)
  const endCareItems = endCareCustomers.map(c => {
    const supply = c.billing_amount ?? 0
    const vatAmt = isNoVat(c.payment_method) ? 0 : Math.round(supply * 0.1)
    return {
      id: c.id,
      business_name: c.business_name,
      service_type: '정기엔드케어',
      construction_date: null as string | null,
      supply_amount: supply,
      vat: vatAmt,
      payment_method: c.payment_method as string | null,
      total: supply + vatAmt,
    }
  })

  const allRevenueItems = [...revenueItems, ...endCareItems]
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
export async function POST(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()
  const { year_month, category, name, amount, note } = body

  if (!year_month || !category || !name) {
    return NextResponse.json({ error: 'year_month, category, name이 필요합니다.' }, { status: 400 })
  }
  if (!['fixed', 'variable'].includes(category)) {
    return NextResponse.json({ error: 'category는 fixed 또는 variable이어야 합니다.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('finance_records')
    .insert({ year_month, category, name, amount: amount ?? 0, note: note ?? null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ record: data }, { status: 201 })
}

// PATCH /api/admin/finance — 항목 수정
export async function PATCH(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()
  const { id, name, amount, note } = body

  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (name !== undefined) updates.name = name
  if (amount !== undefined) updates.amount = amount
  if (note !== undefined) updates.note = note

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
