import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const worker_id = searchParams.get('worker_id')
  const application_id = searchParams.get('application_id')

  if (!worker_id && !application_id) {
    return NextResponse.json({ error: 'worker_id 또는 application_id가 필요합니다.' }, { status: 400 })
  }

  let query = supabase
    .from('work_assignments')
    .select('id, worker_id, application_id, construction_date, business_name, salary, created_at')
    .order('construction_date', { ascending: false })

  if (worker_id) query = query.eq('worker_id', worker_id)
  if (application_id) query = query.eq('application_id', application_id)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ assignments: data })
}

export async function POST(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()
  const { worker_id, application_id, construction_date, business_name, salary } = body

  if (!worker_id) {
    return NextResponse.json({ error: 'worker_id가 필요합니다.' }, { status: 400 })
  }

  if (!construction_date || !business_name) {
    return NextResponse.json({ error: '시공일자와 업체명은 필수입니다.' }, { status: 400 })
  }

  const insert: Record<string, unknown> = {
    worker_id,
    construction_date,
    business_name,
  }
  if (application_id) insert.application_id = application_id
  if (salary !== undefined) insert.salary = salary

  const { data, error } = await supabase
    .from('work_assignments')
    .insert(insert)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ assignment: data }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()
  const { id, salary } = body

  if (!id) {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('work_assignments')
    .update({ salary })
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
    .from('work_assignments')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
