import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

export async function GET() {
  const session = getServerSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const supabase = createServiceClient()
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const isAdmin = session.role === 'admin'

  const [
    scheduleRes,
    applicationsRes,
    inventoryRes,
    requestsRes,
    noticesRes,
    workerRequestsRes,
  ] = await Promise.all([
    // schedule: 오늘 이후 배정된 일정 (worker용)
    isAdmin
      ? Promise.resolve({ count: 0 })
      : supabase
          .from('service_schedules')
          .select('id', { count: 'exact', head: true })
          .eq('worker_id', session.userId)
          .gte('scheduled_date', today),

    // applications: 최근 7일 신규 신청 (admin용)
    isAdmin
      ? supabase
          .from('service_applications')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', sevenDaysAgo)
      : Promise.resolve({ count: 0 }),

    // inventory: 별도 처리 (아래 lowItems에서 계산)
    Promise.resolve({ count: 0 }),

    // requests: pending 상태
    isAdmin
      ? supabase
          .from('requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
      : supabase
          .from('requests')
          .select('id', { count: 'exact', head: true })
          .eq('requester_id', session.userId)
          .eq('status', 'pending'),

    // notices: 최근 7일 신규
    supabase
      .from('notices')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo),

    // worker_requests: 본인 요청 중 admin_memo 있고 미읽음
    supabase
      .from('requests')
      .select('id', { count: 'exact', head: true })
      .eq('requester_id', session.userId)
      .eq('requester_read', false)
      .not('admin_memo', 'is', null),
  ])

  // inventory는 raw sql filter 없이 간단히 처리
  let inventoryCount = 0
  if (isAdmin) {
    const { data: lowItems } = await supabase
      .from('inventory_items')
      .select('id, current_qty, min_qty')
    inventoryCount = (lowItems ?? []).filter(
      (item) => typeof item.current_qty === 'number' && typeof item.min_qty === 'number' && item.current_qty <= item.min_qty
    ).length
  }

  return NextResponse.json({
    schedule: scheduleRes.count ?? 0,
    applications: applicationsRes.count ?? 0,
    inventory: inventoryCount,
    requests: requestsRes.count ?? 0,
    notices: noticesRes.count ?? 0,
    worker_requests: workerRequestsRes.count ?? 0,
  })
}

export async function DELETE(request: NextRequest) {
  const session = getServerSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const key = searchParams.get('key')

  if (!key) return NextResponse.json({ error: 'key가 필요합니다.' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('nav_dismissed')
    .upsert(
      { user_id: session.userId, nav_key: key, dismissed_at: new Date().toISOString() },
      { onConflict: 'user_id,nav_key' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
