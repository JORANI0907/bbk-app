import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const ALLOWED_COLUMNS = [
  'name', 'employment_type', 'phone', 'account_number',
  'department', 'position', 'job_title', 'email', 'join_date',
  'skill_level', 'specialties', 'day_wage', 'night_wage', 'avg_salary',
  'anniversary', 'hobby', 'home_address', 'emergency_contact',
]

export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const employment_type = searchParams.get('employment_type')
  const search = searchParams.get('search')

  let query = supabase
    .from('workers')
    .select('*')
    .order('created_at', { ascending: false })

  if (employment_type) {
    query = query.eq('employment_type', employment_type)
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ workers: data })
}

export async function POST(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()

  const insert: Record<string, unknown> = {}
  for (const key of ALLOWED_COLUMNS) {
    if (key in body) insert[key] = body[key]
  }

  if (!insert.name) {
    return NextResponse.json({ error: '이름은 필수입니다.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('workers')
    .insert(insert)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ worker: data }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()
  const { id, ...rest } = body

  if (!id) {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  for (const key of ALLOWED_COLUMNS) {
    if (key in rest) updates[key] = rest[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: '업데이트할 필드가 없습니다.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('workers')
    .update(updates)
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()
  const { id } = body

  if (!id) {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('workers')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
