import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

function getKSTDateString() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}

export async function GET() {
  const session = getServerSession()
  if (!session || (session.role !== 'worker' && session.role !== 'admin')) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const kstNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  const monthStart = `${kstNow.getFullYear()}-${String(kstNow.getMonth() + 1).padStart(2, '0')}-01`
  const nextMonth = new Date(kstNow.getFullYear(), kstNow.getMonth() + 1, 1)
  const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`

  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('worker_id', session.userId)
    .gte('work_date', monthStart)
    .lt('work_date', monthEnd)
    .order('work_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ month: data ?? [] })
}

export async function POST(request: NextRequest) {
  const session = getServerSession()
  if (!session || (session.role !== 'worker' && session.role !== 'admin')) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 401 })
  }

  const { lat, lng, work_date } = await request.json()
  const dateToRecord = work_date ?? getKSTDateString()

  const supabase = createServiceClient()

  // 동일 날짜 중복 출근 방지
  const { data: existing } = await supabase
    .from('attendance')
    .select('id')
    .eq('worker_id', session.userId)
    .eq('work_date', dateToRecord)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: '이미 해당 날짜의 출근 기록이 있습니다.' }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('attendance')
    .insert({
      worker_id: session.userId,
      worker_name: session.name ?? null,
      work_date: dateToRecord,
      clock_in: new Date().toISOString(),
      clock_in_lat: lat ?? null,
      clock_in_lng: lng ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ attendance: data })
}

export async function PATCH(request: NextRequest) {
  const session = getServerSession()
  if (!session || (session.role !== 'worker' && session.role !== 'admin')) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 401 })
  }

  const { id, lat, lng } = await request.json()
  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('attendance')
    .update({
      clock_out: new Date().toISOString(),
      clock_out_lat: lat ?? null,
      clock_out_lng: lng ?? null,
    })
    .eq('id', id)
    .eq('worker_id', session.userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
