import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { createInAppNotification } from '@/lib/in-app-notification'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = getServerSession()
  if (!session || (session.role !== 'worker' && session.role !== 'admin')) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 401 })
  }

  const supabase = createServiceClient()

  let query = supabase
    .from('service_schedules')
    .select('*, customer:customers(*), worker:users(id,name,phone)')
    .eq('id', params.id)

  // 직원은 본인 배정 일정만, 관리자는 전체 접근
  if (session.role === 'worker') {
    query = query.eq('worker_id', session.userId)
  }

  const { data, error } = await query.single()

  if (error || !data) {
    return NextResponse.json({ error: '일정을 찾을 수 없습니다.' }, { status: 404 })
  }

  // application_id로 직접 조회 (customer_id 기반 조회는 null 이슈 있음)
  const appId = data.application_id as string | null
  const { data: application } = appId
    ? await supabase
        .from('service_applications')
        .select('service_type')
        .eq('id', appId)
        .maybeSingle()
    : { data: null }

  return NextResponse.json({
    schedule: { ...data, service_type: application?.service_type ?? null },
    isAdmin: session.role === 'admin',
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = getServerSession()
  if (!session || (session.role !== 'worker' && session.role !== 'admin')) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 401 })
  }

  const body = await request.json()
  const { closing_checklist, ...scheduleUpdates } = body

  const supabase = createServiceClient()

  // 마감 체크리스트 처리
  if (closing_checklist) {
    const { data: existing } = await supabase
      .from('closing_checklists')
      .select('id')
      .eq('schedule_id', params.id)
      .single()

    if (existing) {
      await supabase
        .from('closing_checklists')
        .update({ ...closing_checklist, completed_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      await supabase.from('closing_checklists').insert({
        schedule_id: params.id,
        ...closing_checklist,
        completed_at: new Date().toISOString(),
      })
    }
  }

  // 일정 업데이트 (관리자는 worker_id 제한 없음)
  if (Object.keys(scheduleUpdates).length > 0) {
    let query = supabase
      .from('service_schedules')
      .update({ ...scheduleUpdates, updated_at: new Date().toISOString() })
      .eq('id', params.id)

    if (session.role === 'worker') {
      query = query.eq('worker_id', session.userId)
    }

    const { error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // 작업 완료 시 고객 인앱 알림
    if (scheduleUpdates.status === 'completed') {
      void notifyWorkCompleted(supabase, params.id)
    }
  }

  return NextResponse.json({ success: true })
}

interface ScheduleForNotify {
  scheduled_date: string
  customer_id: string | null
  customers: { user_id: string | null }[] | { user_id: string | null } | null
}

function extractUserId(
  customers: ScheduleForNotify['customers'],
): string | null {
  if (!customers) return null
  if (Array.isArray(customers)) return customers[0]?.user_id ?? null
  return customers.user_id
}

async function notifyWorkCompleted(
  supabase: ReturnType<typeof createServiceClient>,
  scheduleId: string,
): Promise<void> {
  const { data } = await supabase
    .from('service_schedules')
    .select('scheduled_date, customer_id, customers(user_id)')
    .eq('id', scheduleId)
    .maybeSingle()

  if (!data) return
  const row = data as unknown as ScheduleForNotify
  const userId = extractUserId(row.customers)
  if (!row.customer_id || !userId) return

  const dateLabel = row.scheduled_date
    ? new Date(row.scheduled_date).toLocaleDateString('ko-KR', {
        month: 'long',
        day: 'numeric',
      })
    : ''

  await createInAppNotification({
    customerId: row.customer_id,
    userId,
    type: 'work_completed',
    title: '방문 청소가 완료됐어요',
    body: `${dateLabel} 방문 서비스가 완료됐습니다. 리포트를 확인해보세요.`,
    actionUrl: `/customer/schedule/${scheduleId}`,
    metadata: { schedule_id: scheduleId },
  })
}
