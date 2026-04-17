import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = getServerSession()
  if (!session || (session.role !== 'worker' && session.role !== 'admin')) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date 쿼리 필요 (YYYY-MM-DD)' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const [{ data: schedules, error: sErr }, { data: workerProfile, error: wErr }] = await Promise.all([
    supabase
      .from('service_schedules')
      .select('*, customer:customers(*)')
      .eq('worker_id', session.userId)
      .eq('scheduled_date', date)
      .order('scheduled_time_start', { ascending: true }),
    supabase
      .from('users')
      .select('name')
      .eq('id', session.userId)
      .single(),
  ])

  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })
  if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 })

  return NextResponse.json({
    schedules: schedules ?? [],
    workerName: workerProfile?.name ?? '',
  })
}
