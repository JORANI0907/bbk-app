import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const customerId = searchParams.get('customer_id')
  const status = searchParams.get('status')

  if (!customerId) {
    return NextResponse.json({ error: 'customer_id가 필요합니다.' }, { status: 400 })
  }

  let query = supabase
    .from('service_billings')
    .select('*')
    .eq('customer_id', customerId)
    .order('due_date', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ billings: data })
}

export async function POST(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()
  const { customer_id, billing_type, billing_period, amount, due_date, notes } = body

  if (!customer_id || !billing_type || !billing_period || !amount || !due_date) {
    return NextResponse.json({ error: '필수 항목(customer_id, billing_type, billing_period, amount, due_date)이 누락되었습니다.' }, { status: 400 })
  }

  if (!['monthly', 'annual'].includes(billing_type)) {
    return NextResponse.json({ error: "billing_type은 'monthly' 또는 'annual'이어야 합니다." }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('service_billings')
    .insert({ customer_id, billing_type, billing_period, amount: Number(amount), due_date, notes: notes || null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ billing: data }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()
  const { id, ...rest } = body

  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

  const ALLOWED = ['status', 'paid_date', 'notes', 'amount', 'due_date']
  const updates: Record<string, unknown> = {}
  for (const key of ALLOWED) {
    if (key in rest) updates[key] = rest[key]
  }

  const { error } = await supabase
    .from('service_billings')
    .update(updates)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

  const { error } = await supabase
    .from('service_billings')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
