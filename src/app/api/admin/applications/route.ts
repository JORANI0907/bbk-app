import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  let query = supabase
    .from('service_applications')
    .select('*')
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ applications: data })
}

export async function POST(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()

  if (!body.business_name || !body.owner_name || !body.phone || !body.address) {
    return NextResponse.json({ error: '업체명, 대표자명, 연락처, 주소는 필수입니다.' }, { status: 400 })
  }

  const ALLOWED_POST = [
    'owner_name', 'business_name', 'phone', 'email', 'address',
    'business_number', 'account_number', 'service_type', 'admin_notes',
    'payment_method', 'request_notes', 'platform_nickname',
  ]
  const insert: Record<string, unknown> = { status: '신규' }
  for (const key of ALLOWED_POST) {
    if (key in body) insert[key] = body[key]
  }

  const { data, error } = await supabase
    .from('service_applications')
    .insert(insert)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ application: data }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()
  const { id, ...rest } = body

  if (!id) {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })
  }

  const ALLOWED = [
    'status', 'admin_notes', 'service_type', 'assigned_to',
    'deposit', 'supply_amount', 'vat', 'balance', 'drive_folder_url',
    'phone', 'email', 'address', 'business_number', 'account_number',
    'payment_method', 'elevator', 'building_access', 'access_method', 'parking', 'request_notes',
    'construction_date', 'business_hours_start', 'business_hours_end',
  ]
  const updates: Record<string, unknown> = {}
  for (const key of ALLOWED) {
    if (key in rest) updates[key] = rest[key]
  }

  const { error } = await supabase
    .from('service_applications')
    .update(updates)
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('service_applications')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
