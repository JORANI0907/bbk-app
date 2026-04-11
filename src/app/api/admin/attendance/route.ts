import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

const ALLOWED_POST = ['worker_id', 'work_date', 'clock_in', 'clock_out', 'notes',
  'clock_in_lat', 'clock_in_lng', 'clock_out_lat', 'clock_out_lng', 'worker_name', 'status',
  'clock_in_photo_url', 'clock_out_photo_url']
const ALLOWED_PATCH = ['clock_out', 'notes', 'clock_in', 'status',
  'clock_out_lat', 'clock_out_lng', 'clock_in_photo_url', 'clock_out_photo_url']

export async function GET(request: NextRequest) {
  const session = getServerSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month') // YYYY-MM
  const worker_id = searchParams.get('worker_id')

  const supabase = createServiceClient()

  let query = supabase
    .from('attendance')
    .select('*, worker:workers(id, name, employment_type)')
    .order('work_date', { ascending: false })
    .order('clock_in', { ascending: true })

  if (month) {
    const start = `${month}-01`
    const [year, mon] = month.split('-').map(Number)
    const nextMonth = mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, '0')}-01`
    query = query.gte('work_date', start).lt('work_date', nextMonth)
  }

  if (worker_id) {
    query = query.eq('worker_id', worker_id)
  } else if (session.role === 'worker') {
    query = query.eq('worker_id', session.userId)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(request: NextRequest) {
  const session = getServerSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const body = await request.json()
  const insert: Record<string, unknown> = {}
  for (const key of ALLOWED_POST) {
    if (key in body) insert[key] = body[key]
  }

  if (!insert.worker_id || !insert.work_date) {
    return NextResponse.json({ error: 'worker_id, work_date는 필수입니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('attendance')
    .insert(insert)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const session = getServerSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const body = await request.json()
  const { id, ...rest } = body

  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  for (const key of ALLOWED_PATCH) {
    if (key in rest) updates[key] = rest[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: '업데이트할 필드가 없습니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('attendance')
    .update(updates)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
