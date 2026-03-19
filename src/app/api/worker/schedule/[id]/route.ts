import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

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

  return NextResponse.json({ schedule: data, isAdmin: session.role === 'admin' })
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
  }

  return NextResponse.json({ success: true })
}
