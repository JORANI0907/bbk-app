import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/admin/unit-price-monthly?month=YYYY-MM
export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month')

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month 파라미터가 필요합니다. (YYYY-MM)' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('unit_price_monthly')
    .select('id, application_id, year_month, unit_price')
    .eq('year_month', month)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ prices: data ?? [] })
}

// POST /api/admin/unit-price-monthly — 전월 단가 일괄 이관
// body: { month: 'YYYY-MM', from_month: 'YYYY-MM' }
export async function POST(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()
  const { month, from_month } = body

  if (!month || !from_month) {
    return NextResponse.json({ error: 'month, from_month이 필요합니다.' }, { status: 400 })
  }

  const { data: prevPrices, error: fetchErr } = await supabase
    .from('unit_price_monthly')
    .select('application_id, unit_price')
    .eq('year_month', from_month)

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!prevPrices || prevPrices.length === 0) {
    return NextResponse.json({ inserted: 0 })
  }

  const inserts = prevPrices.map(p => ({
    application_id: p.application_id,
    year_month: month,
    unit_price: p.unit_price,
  }))

  const { data: inserted, error: upsertErr } = await supabase
    .from('unit_price_monthly')
    .upsert(inserts, { onConflict: 'application_id,year_month', ignoreDuplicates: true })
    .select()

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  return NextResponse.json({ inserted: inserted?.length ?? 0 }, { status: 201 })
}

// PATCH /api/admin/unit-price-monthly — 단일 단가 저장
// body: { application_id, year_month, unit_price }
export async function PATCH(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()
  const { application_id, year_month, unit_price } = body

  if (!application_id || !year_month || unit_price === undefined) {
    return NextResponse.json({ error: 'application_id, year_month, unit_price가 필요합니다.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('unit_price_monthly')
    .upsert(
      { application_id, year_month, unit_price: unit_price === '' ? 0 : Number(unit_price), updated_at: new Date().toISOString() },
      { onConflict: 'application_id,year_month' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ price: data })
}
