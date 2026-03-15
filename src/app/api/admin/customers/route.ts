import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const ALLOWED = [
  'business_name', 'contact_name', 'contact_phone', 'email',
  'address', 'address_detail', 'business_number', 'account_number',
  'platform_nickname', 'payment_method', 'elevator', 'building_access',
  'access_method', 'business_hours_start', 'business_hours_end',
  'door_password', 'parking_info', 'special_notes', 'care_scope', 'pipeline_status',
  'customer_type', 'status', 'billing_cycle', 'billing_amount',
  'billing_start_date', 'billing_next_date', 'contract_start_date',
  'contract_end_date', 'unit_price', 'visit_interval_days', 'next_visit_date', 'notes',
]

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('customers')
    .select('id, business_name, contact_name, contact_phone, email, address, address_detail, business_number, account_number, platform_nickname, payment_method, elevator, building_access, access_method, business_hours_start, business_hours_end, door_password, parking_info, special_notes, care_scope, pipeline_status, customer_type, status, billing_cycle, billing_amount, billing_start_date, billing_next_date, contract_start_date, contract_end_date, unit_price, visit_interval_days, next_visit_date, notes, created_at, updated_at')
    .order('business_name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ customers: data })
}

export async function POST(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()

  if (!body.business_name?.trim()) {
    return NextResponse.json({ error: '업체명은 필수입니다.' }, { status: 400 })
  }

  const insert: Record<string, unknown> = {}
  for (const key of ALLOWED) {
    if (key in body) insert[key] = body[key]
  }

  const { data, error } = await supabase
    .from('customers')
    .insert(insert)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ customer: data }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()
  const { id, ...rest } = body

  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of ALLOWED) {
    if (key in rest) updates[key] = rest[key]
  }

  const { error } = await supabase.from('customers').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

  const { error } = await supabase.from('customers').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
