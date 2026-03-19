import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { format, startOfMonth, endOfMonth } from 'date-fns'

export async function GET() {
  const session = getServerSession()
  if (!session || session.role !== 'worker' && session.role !== 'admin') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const today = format(new Date(), 'yyyy-MM-dd')
  const currentMonth = new Date()
  const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd')

  const [todayResult, monthResult] = await Promise.all([
    supabase
      .from('attendances')
      .select('*')
      .eq('worker_id', session.userId)
      .eq('work_date', today)
      .single(),
    supabase
      .from('attendances')
      .select('*')
      .eq('worker_id', session.userId)
      .gte('work_date', monthStart)
      .lte('work_date', monthEnd),
  ])

  return NextResponse.json({
    today: todayResult.data ?? null,
    month: monthResult.data ?? [],
  })
}

export async function POST(request: NextRequest) {
  const session = getServerSession()
  if (!session || session.role !== 'worker' && session.role !== 'admin') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 401 })
  }

  const { lat, lng } = await request.json()
  const supabase = createServiceClient()
  const today = format(new Date(), 'yyyy-MM-dd')

  const { data, error } = await supabase
    .from('attendances')
    .insert({
      worker_id: session.userId,
      work_date: today,
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
  if (!session || session.role !== 'worker' && session.role !== 'admin') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 401 })
  }

  const { id, lat, lng } = await request.json()
  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('attendances')
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
