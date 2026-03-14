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
