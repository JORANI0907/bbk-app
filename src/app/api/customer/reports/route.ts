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

interface ClosingJoin {
  condition_score: ConditionScore | null
  recommended_services: RecommendedService[] | null
  completed_at: string | null
}

interface PhotoJoin {
  photo_type: string
}

interface ScheduleRow {
  id: string
  scheduled_date: string
  status: string
  worker: WorkerJoin | WorkerJoin[] | null
  closing_checklists: ClosingJoin[] | null
  work_photos: PhotoJoin[] | null
}

export async function GET(request: NextRequest) {
  const session = getServerSession()
  if (!session || session.role !== 'customer') {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // 1) 세션에서 고객 ID 조회
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

  // 2) 옵션: months 파라미터 (기본 12)
  const url = new URL(request.url)
  const monthsParam = url.searchParams.get('months')
  const months = monthsParam ? Math.max(1, Math.min(36, parseInt(monthsParam, 10))) : 12
  const sinceDate = new Date()
  sinceDate.setMonth(sinceDate.getMonth() - months)
  const sinceIso = sinceDate.toISOString().slice(0, 10)

  // 3) 완료된 일정 + closing 체크리스트 + 사진 + 작업자 조인
  const { data, error } = await supabase
    .from('service_schedules')
    .select(
      `id,
       scheduled_date,
       status,
       worker:users(name),
       closing_checklists(condition_score, recommended_services, completed_at),
       work_photos(photo_type)`,
    )
    .eq('customer_id', customerId)
    .eq('status', 'completed')
    .gte('scheduled_date', sinceIso)
    .order('scheduled_date', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as ScheduleRow[]

  // 4) 전체 완료 횟수 (기간 제한 없이)
  const { count: totalCount } = await supabase
    .from('service_schedules')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', customerId)
    .eq('status', 'completed')

  // 5) 가공
  const schedules: ReportScheduleItem[] = rows.map((row) => {
    const closing = row.closing_checklists?.[0] ?? null
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
    }
  })

  // 6) 가장 최근의 추천 서비스 추출
  let latestRecommendations: RecommendedService[] = []
  let latestReportDate: string | null = null
  for (const row of rows) {
    const closing = row.closing_checklists?.[0]
    const recs = closing?.recommended_services
    if (Array.isArray(recs) && recs.length > 0) {
      latestRecommendations = recs
      latestReportDate = row.scheduled_date
      break
    }
  }

  const response: CustomerReportsResponse = {
    totalCount: totalCount ?? 0,
    schedules,
    latestRecommendations,
    latestReportDate,
  }

  return NextResponse.json(response)
}
