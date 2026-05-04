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

  // 담당자(assigned_to)로 배정된 service_applications ID 목록 조회
  const { data: assignedApps } = await supabase
    .from('service_applications')
    .select('id')
    .eq('assigned_to', session.userId)

  const assignedAppIds = assignedApps?.map((a) => a.id) ?? []

  const [
    { data: workerSchedules, error: sErr1 },
    { data: assignedSchedules, error: sErr2 },
    { data: workerProfile, error: wErr },
  ] = await Promise.all([
    // 작업자(worker_id)로 배정된 일정
    supabase
      .from('service_schedules')
      .select('*, customer:customers(*)')
      .eq('worker_id', session.userId)
      .eq('scheduled_date', date)
      .order('scheduled_time_start', { ascending: true }),
    // 담당자(assigned_to)로 배정된 일정
    assignedAppIds.length > 0
      ? supabase
          .from('service_schedules')
          .select('*, customer:customers(*)')
          .in('application_id', assignedAppIds)
          .eq('scheduled_date', date)
          .order('scheduled_time_start', { ascending: true })
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    supabase.from('users').select('name').eq('id', session.userId).single(),
  ])

  if (sErr1) return NextResponse.json({ error: sErr1.message }, { status: 500 })
  if (sErr2) return NextResponse.json({ error: sErr2.message }, { status: 500 })
  if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 })

  // 중복 제거 후 시간순 정렬
  const merged = [
    ...(workerSchedules ?? []),
    ...(assignedSchedules ?? []),
  ]
  const seen = new Set<string>()
  const schedules = merged
    .filter((s) => {
      if (seen.has(s.id as string)) return false
      seen.add(s.id as string)
      return true
    })
    .sort((a, b) =>
      (a.scheduled_time_start as string ?? '').localeCompare(b.scheduled_time_start as string ?? ''),
    )

  return NextResponse.json({
    schedules,
    workerName: workerProfile?.name ?? '',
  })
}
