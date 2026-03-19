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

  const [appsRes, payrollRes, fixedRes, variableRes] = await Promise.all([
    // 매출: 해당 월 service_applications의 supply_amount + vat
    supabase
      .from('service_applications')
      .select('id, business_name, supply_amount, vat, payment_method, service_type, construction_date')
      .gte('construction_date', `${month}-01`)
      .lte('construction_date', `${month}-31`)
      .not('supply_amount', 'is', null)
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
  ])

  if (appsRes.error) return NextResponse.json({ error: appsRes.error.message }, { status: 500 })
  if (payrollRes.error) return NextResponse.json({ error: payrollRes.error.message }, { status: 500 })
  if (fixedRes.error) return NextResponse.json({ error: fixedRes.error.message }, { status: 500 })
  if (variableRes.error) return NextResponse.json({ error: variableRes.error.message }, { status: 500 })

  const apps = appsRes.data ?? []
  const payrolls = payrollRes.data ?? []
  const fixedRecords = fixedRes.data ?? []
  const variableRecords = variableRes.data ?? []

  // 매출 계산 (부가세 X 결제방법이면 vat 제외)
  const revenueItems = apps.map(a => {
    const noVat = a.payment_method === '현금(부가세 X)'
    const total = (a.supply_amount ?? 0) + (noVat ? 0 : (a.vat ?? 0))
    return { ...a, total }
  })
  const revenueTotal = revenueItems.reduce((s, a) => s + a.total, 0)

  // 인건비 계산
  const laborTotal = payrolls.reduce((s, r) => s + (r.final_amount ?? r.auto_amount), 0)

  // 고정비 합계
  const fixedTotal = fixedRecords.reduce((s, r) => s + Number(r.amount), 0)

  // 변동비 합계
  const variableTotal = variableRecords.reduce((s, r) => s + Number(r.amount), 0)

  // 순이익
  const netProfit = revenueTotal - laborTotal - fixedTotal - variableTotal

  return NextResponse.json({
    revenue: { total: revenueTotal, items: revenueItems },
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
