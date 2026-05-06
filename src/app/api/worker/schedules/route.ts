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

  // 경로 1: service_schedules.worker_id = users.id (직접 배정)
  // 경로 2: service_applications.assigned_to = users.id → application_id 경로
  // 경로 3: workers.user_id = users.id → work_assignments.worker_id = workers.id → application_id 경로

  const [
    { data: assignedApps },
    { data: workerRow },
  ] = await Promise.all([
    // 경로 2: 담당자(assigned_to)로 배정된 service_applications
    supabase
      .from('service_applications')
      .select('id')
      .eq('assigned_to', session.userId),
    // 경로 3: workers 테이블에서 이 user의 worker row 조회
    supabase
      .from('workers')
      .select('id')
      .eq('user_id', session.userId)
      .maybeSingle(),
  ])

  const assignedAppIds = assignedApps?.map((a) => a.id) ?? []

  // 경로 3: work_assignments에서 해당 worker의 application_id 수집
  const workAssignmentAppIds: string[] = []
  if (workerRow?.id) {
    const { data: workAssignments } = await supabase
      .from('work_assignments')
      .select('application_id')
      .eq('worker_id', workerRow.id)
      .not('application_id', 'is', null)
    workAssignmentAppIds.push(
      ...(workAssignments?.map((a) => a.application_id as string).filter(Boolean) ?? [])
    )
  }

  // 경로 2 + 3 합산 (중복 제거)
  const allAppIds = Array.from(new Set([...assignedAppIds, ...workAssignmentAppIds]))

  const [
    { data: workerSchedules, error: sErr1 },
    { data: assignedSchedules, error: sErr2 },
    { data: workerProfile, error: wErr },
  ] = await Promise.all([
    // 경로 1: worker_id로 직접 배정된 일정
    supabase
      .from('service_schedules')
      .select('*, customer:customers(*)')
      .eq('worker_id', session.userId)
      .eq('scheduled_date', date)
      .order('scheduled_time_start', { ascending: true }),
    // 경로 2+3: application_id 경유 일정
    allAppIds.length > 0
      ? supabase
          .from('service_schedules')
          .select('*, customer:customers(*)')
          .in('application_id', allAppIds)
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
