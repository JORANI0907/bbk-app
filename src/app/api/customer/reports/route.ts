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
  notes: string | null
  photo_urls: string[]
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
  photo_url: string | null
}

interface ScheduleRow {
  id: string
  scheduled_date: string
  status: string
  application_id: string | null
  worker: WorkerJoin | WorkerJoin[] | null
}

interface ClosingRow {
  schedule_id: string
  condition_score: ConditionScore | null
  recommended_services: RecommendedService[] | null
  completed_at: string | null
  customer_comment: string | null
}

interface ApplicationRow {
  id: string
  construction_date: string | null
  work_completed_at: string | null
  condition_score: number | null
  recommended_services: RecommendedService[] | null
  drive_folder_url: string | null
  customer_memo: string | null
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
    // 워커 포털 완료 일정 (closing_checklists, work_photos 별도 쿼리)
    supabase
      .from('service_schedules')
      .select(
        `id, scheduled_date, status, application_id,
         worker:users!worker_id(name)`,
      )
      .eq('customer_id', customerId)
      .eq('status', 'completed')
      .is('deleted_at', null)
      .gte('scheduled_date', sinceIso)
      .order('scheduled_date', { ascending: false }),

    // 관리자 WorkPanel 완료 신청서
    supabase
      .from('service_applications')
      .select(
        `id, construction_date, work_completed_at,
         condition_score, recommended_services, drive_folder_url, customer_memo, assigned_to`,
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
      .eq('status', 'completed')
      .is('deleted_at', null),

    supabase
      .from('service_applications')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customerId)
      .eq('work_status', 'completed'),
  ])

  const scheduleRows = (scheduleResult.data ?? []) as ScheduleRow[]
  const appRows = (appResult.data ?? []) as ApplicationRow[]

  // closing_checklists + work_photos + application 데이터 별도 조회
  const scheduleIds = scheduleRows.map((r) => r.id)
  const appIds = Array.from(new Set(scheduleRows.map((r) => r.application_id).filter(Boolean))) as string[]

  const checklistMap = new Map<string, ClosingRow>()
  const photoMap = new Map<string, PhotoJoin[]>()
  const schedAppMap = new Map<string, { drive_folder_url: string | null; customer_memo: string | null; recommended_services: RecommendedService[] | null }>()

  await Promise.all([
    scheduleIds.length > 0
      ? supabase
          .from('closing_checklists')
          .select('schedule_id, condition_score, recommended_services, completed_at, customer_comment')
          .in('schedule_id', scheduleIds)
          .then(({ data }) => {
            for (const c of data ?? []) {
              if (c.schedule_id) checklistMap.set(c.schedule_id, c as ClosingRow)
            }
          })
      : Promise.resolve(),
    scheduleIds.length > 0
      ? supabase
          .from('work_photos')
          .select('schedule_id, photo_type, photo_url')
          .in('schedule_id', scheduleIds)
          .then(({ data }) => {
            for (const p of data ?? []) {
              if (!p.schedule_id) return
              const arr = photoMap.get(p.schedule_id) ?? []
              arr.push(p as PhotoJoin)
              photoMap.set(p.schedule_id, arr)
            }
          })
      : Promise.resolve(),
    appIds.length > 0
      ? supabase
          .from('service_applications')
          .select('id, drive_folder_url, customer_memo, recommended_services')
          .in('id', appIds)
          .then(({ data }) => {
            for (const a of data ?? []) {
              if (a.id) schedAppMap.set(a.id, {
                drive_folder_url: a.drive_folder_url ?? null,
                customer_memo: a.customer_memo ?? null,
                recommended_services: (a.recommended_services as RecommendedService[] | null) ?? null,
              })
            }
          })
      : Promise.resolve(),
  ])

  // schedule_id → application_id 역참조 맵 (권장 서비스 fallback 조회용)
  const scheduleIdToAppId = new Map<string, string>()
  for (const r of scheduleRows) {
    if (r.application_id) scheduleIdToAppId.set(r.id, r.application_id)
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
    const photos = photoMap.get(row.id) ?? []
    const appData = row.application_id ? (schedAppMap.get(row.application_id) ?? null) : null
    const workerJoin = Array.isArray(row.worker) ? row.worker[0] : row.worker
    return {
      id: row.id,
      scheduled_date: row.scheduled_date,
      status: row.status,
      worker_name: workerJoin?.name ?? null,
      condition_score: closing?.condition_score ?? null,
      notes: appData?.customer_memo ?? null,
      photo_urls: photos.map((p) => p.photo_url).filter((u): u is string => !!u),
      has_before_photo: photos.some((p) => p.photo_type === 'before'),
      has_after_photo: photos.some((p) => p.photo_type === 'after'),
      closing_completed_at: closing?.completed_at ?? null,
      source: 'schedule' as const,
      drive_folder_url: appData?.drive_folder_url ?? null,
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
      notes: app.customer_memo ?? null,
      photo_urls: [],
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

  // 모든 방문의 권장 서비스 누적 수집 (name 기준 중복 제거, 우선순위 높은 쪽 유지)
  const PRIORITY_ORDER: Record<string, number> = { high: 3, medium: 2, low: 1 }
  const recMap = new Map<string, RecommendedService>()

  for (const item of allItems) {
    let recs: RecommendedService[] | null = null

    if (item.source === 'schedule') {
      const checklistRecs = checklistMap.get(item.id)?.recommended_services ?? null
      if (Array.isArray(checklistRecs) && checklistRecs.length > 0) {
        recs = checklistRecs
      } else {
        const appId = scheduleIdToAppId.get(item.id)
        if (appId) {
          const appRecs = schedAppMap.get(appId)?.recommended_services
          recs = Array.isArray(appRecs) && appRecs.length > 0 ? appRecs : null
        }
      }
    } else {
      const matchApp = appRows.find((a) => a.id === item.id)
      recs = matchApp?.recommended_services ?? null
    }

    if (!Array.isArray(recs)) continue
    for (const rec of recs) {
      const existing = recMap.get(rec.name)
      if (!existing || (PRIORITY_ORDER[rec.priority] ?? 0) > (PRIORITY_ORDER[existing.priority] ?? 0)) {
        recMap.set(rec.name, rec)
      }
    }
  }

  const latestRecommendations: RecommendedService[] = Array.from(recMap.values())
    .sort((a, b) => (PRIORITY_ORDER[b.priority] ?? 0) - (PRIORITY_ORDER[a.priority] ?? 0))
  const latestReportDate: string | null = null

  const response: CustomerReportsResponse = {
    totalCount,
    schedules: allItems,
    latestRecommendations,
    latestReportDate,
  }

  return NextResponse.json(response)
}
