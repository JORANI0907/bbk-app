import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import {
  ConditionScore,
  RecommendedService,
} from '@/types/database'

export interface ReportScheduleItem {
  id: string
  scheduled_date: string
  status: string
  worker_name: string | null
  condition_score: ConditionScore | null
  has_before_photo: boolean
  has_after_photo: boolean
  closing_completed_at: string | null
  source: 'schedule' | 'application'
  drive_folder_url: string | null
}

export interface CustomerReportsResponse {
  totalCount: number
  schedules: ReportScheduleItem[]
  latestRecommendations: RecommendedService[]
  latestReportDate: string | null
}

interface WorkerJoin {
  name: string | null
}

interface PhotoJoin {
  photo_type: string
}

interface ScheduleRow {
  id: string
  scheduled_date: string
  status: string
  worker: WorkerJoin | WorkerJoin[] | null
  work_photos: PhotoJoin[] | null
}

interface ClosingRow {
  schedule_id: string
  condition_score: ConditionScore | null
  recommended_services: RecommendedService[] | null
  completed_at: string | null
}

interface ApplicationRow {
  id: string
  construction_date: string | null
  work_completed_at: string | null
  condition_score: number | null
  recommended_services: RecommendedService[] | null
  drive_folder_url: string | null
  assigned_to: string | null
}

export async function GET(request: NextRequest) {
  const session = getServerSession()
  if (!session || session.role !== 'customer') {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const { data: customerRow, error: customerErr } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', session.userId)
    .maybeSingle()

  if (customerErr || !customerRow) {
    const empty: CustomerReportsResponse = {
      totalCount: 0,
      schedules: [],
      latestRecommendations: [],
      latestReportDate: null,
    }
    return NextResponse.json(empty)
  }

  const customerId = customerRow.id

  const url = new URL(request.url)
  const monthsParam = url.searchParams.get('months')
  const months = monthsParam ? Math.max(1, Math.min(36, parseInt(monthsParam, 10))) : 12
  const sinceDate = new Date()
  sinceDate.setMonth(sinceDate.getMonth() - months)
  const sinceIso = sinceDate.toISOString().slice(0, 10)

  // 두 소스 병렬 조회 (closing_checklists는 별도 쿼리로 분리)
  const [scheduleResult, appResult, scheduleTotalResult, appTotalResult] = await Promise.all([
    // 워커 포털 완료 일정 (closing_checklists 제외)
    supabase
      .from('service_schedules')
      .select(
        `id, scheduled_date, status,
         worker:users!worker_id(name),
         work_photos!schedule_id(photo_type)`,
      )
      .eq('customer_id', customerId)
      .eq('status', 'completed')
      .gte('scheduled_date', sinceIso)
      .order('scheduled_date', { ascending: false }),

    // 관리자 WorkPanel 완료 신청서
    supabase
      .from('service_applications')
      .select(
        `id, construction_date, work_completed_at,
         condition_score, recommended_services, drive_folder_url, assigned_to`,
      )
      .eq('customer_id', customerId)
      .eq('work_status', 'completed')
      .not('construction_date', 'is', null)
      .gte('construction_date', sinceIso)
      .order('construction_date', { ascending: false }),

    supabase
      .from('service_schedules')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customerId)
      .eq('status', 'completed'),

    supabase
      .from('service_applications')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customerId)
      .eq('work_status', 'completed'),
  ])

  const scheduleRows = (scheduleResult.data ?? []) as ScheduleRow[]
  const appRows = (appResult.data ?? []) as ApplicationRow[]

  // closing_checklists 별도 조회 (PostgREST 중첩 조인 우회)
  const scheduleIds = scheduleRows.map((r) => r.id)
  const checklistMap = new Map<string, ClosingRow>()
  if (scheduleIds.length > 0) {
    const { data: checklistRows } = await supabase
      .from('closing_checklists')
      .select('schedule_id, condition_score, recommended_services, completed_at')
      .in('schedule_id', scheduleIds)
    for (const c of checklistRows ?? []) {
      if (c.schedule_id) checklistMap.set(c.schedule_id, c as ClosingRow)
    }
  }

  // 신청서 배정 워커 이름 조회
  const assignedIds = Array.from(new Set(appRows.map((a) => a.assigned_to).filter(Boolean))) as string[]
  const workerNameMap: Record<string, string> = {}
  if (assignedIds.length > 0) {
    const { data: workerRows } = await supabase
      .from('users')
      .select('id, name')
      .in('id', assignedIds)
    for (const w of workerRows ?? []) {
      if (w.id && w.name) workerNameMap[w.id] = w.name
    }
  }

  // schedule 완료 날짜 set (중복 제거용)
  const scheduleDates = new Set(scheduleRows.map((r) => r.scheduled_date))

  // 워커 포털 완료 → ReportScheduleItem
  const scheduleItems: ReportScheduleItem[] = scheduleRows.map((row) => {
    const closing = checklistMap.get(row.id) ?? null
    const photos = row.work_photos ?? []
    const workerJoin = Array.isArray(row.worker) ? row.worker[0] : row.worker
    return {
      id: row.id,
      scheduled_date: row.scheduled_date,
      status: row.status,
      worker_name: workerJoin?.name ?? null,
      condition_score: closing?.condition_score ?? null,
      has_before_photo: photos.some((p) => p.photo_type === 'before'),
      has_after_photo: photos.some((p) => p.photo_type === 'after'),
      closing_completed_at: closing?.completed_at ?? null,
      source: 'schedule' as const,
      drive_folder_url: null,
    }
  })

  // 관리자 WorkPanel 완료 → ReportScheduleItem (날짜 중복 제외)
  const appItems: ReportScheduleItem[] = appRows
    .filter((app) => app.construction_date && !scheduleDates.has(app.construction_date))
    .map((app) => ({
      id: app.id,
      scheduled_date: app.construction_date!,
      status: 'completed',
      worker_name: app.assigned_to ? (workerNameMap[app.assigned_to] ?? null) : null,
      condition_score: (app.condition_score as ConditionScore) ?? null,
      has_before_photo: false,
      has_after_photo: false,
      closing_completed_at: app.work_completed_at ?? null,
      source: 'application' as const,
      drive_folder_url: app.drive_folder_url ?? null,
    }))

  // 병합 + 날짜 내림차순 정렬
  const allItems = [...scheduleItems, ...appItems].sort((a, b) =>
    b.scheduled_date.localeCompare(a.scheduled_date),
  )

  const totalCount = (scheduleTotalResult.count ?? 0) + (appTotalResult.count ?? 0)

  // 가장 최근 추천 서비스 추출 (두 소스 통합)
  let latestRecommendations: RecommendedService[] = []
  let latestReportDate: string | null = null

  for (const item of allItems) {
    let recs: RecommendedService[] | null = null

    if (item.source === 'schedule') {
      recs = checklistMap.get(item.id)?.recommended_services ?? null
    } else {
      const matchApp = appRows.find((a) => a.id === item.id)
      recs = matchApp?.recommended_services ?? null
    }

    if (Array.isArray(recs) && recs.length > 0) {
      latestRecommendations = recs
      latestReportDate = item.scheduled_date
      break
    }
  }

  const response: CustomerReportsResponse = {
    totalCount,
    schedules: allItems,
    latestRecommendations,
    latestReportDate,
  }

  return NextResponse.json(response)
}
