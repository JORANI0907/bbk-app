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

  // ── 유저별 nav_dismissed 조회 ──────────────────────────────────
  const { data: dismissedRows } = await supabase
    .from('nav_dismissed')
    .select('nav_key, dismissed_at')
    .eq('user_id', session.userId)

  const dismissed: Record<string, string> = {}
  for (const row of (dismissedRows ?? [])) {
    dismissed[row.nav_key] = row.dismissed_at
  }

  // ── schedule ──────────────────────────────────────────────────
  let scheduleCount = 0
  if (!isAdmin) {
    let q = supabase
      .from('service_schedules')
      .select('id', { count: 'exact', head: true })
      .eq('worker_id', session.userId)
      .gte('scheduled_date', today)
    if (dismissed.schedule) q = q.gt('created_at', dismissed.schedule)
    const { count } = await q
    scheduleCount = count ?? 0
  }

  // ── applications ──────────────────────────────────────────────
  let applicationsCount = 0
  if (isAdmin) {
    const since = dismissed.applications
      ? (dismissed.applications > sevenDaysAgo ? dismissed.applications : sevenDaysAgo)
      : sevenDaysAgo
    const { count } = await supabase
      .from('service_applications')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since)
    applicationsCount = count ?? 0
  }

  // ── requests ──────────────────────────────────────────────────
  let requestsCount = 0
  if (isAdmin) {
    let q = supabase
      .from('requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
    if (dismissed.requests) q = q.gt('created_at', dismissed.requests)
    const { count } = await q
    requestsCount = count ?? 0
  } else {
    let q = supabase
      .from('requests')
      .select('id', { count: 'exact', head: true })
      .eq('requester_id', session.userId)
      .eq('requester_read', false)
      .not('admin_memo', 'is', null)
    if (dismissed.requests) q = q.gt('updated_at', dismissed.requests)
    const { count } = await q
    requestsCount = count ?? 0
  }

  // ── notices ───────────────────────────────────────────────────
  const noticeSince = dismissed.notices
    ? (dismissed.notices > sevenDaysAgo ? dismissed.notices : sevenDaysAgo)
    : sevenDaysAgo
  const { count: noticesCount } = await supabase
    .from('notices')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', noticeSince)

  // ── worker_requests ───────────────────────────────────────────
  let workerRequestsCount = 0
  if (!isAdmin) {
    let q = supabase
      .from('requests')
      .select('id', { count: 'exact', head: true })
      .eq('requester_id', session.userId)
      .eq('requester_read', false)
      .not('admin_memo', 'is', null)
    if (dismissed.worker_requests) q = q.gt('updated_at', dismissed.worker_requests)
    const { count } = await q
    workerRequestsCount = count ?? 0
  }

  // ── incidents ─────────────────────────────────────────────────
  let incidentsCount = 0
  {
    let q = isAdmin
      ? supabase.from('incidents').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      : supabase.from('incidents').select('id', { count: 'exact', head: true }).eq('author_id', session.userId).eq('status', 'pending')
    if (dismissed.incidents) q = q.gt('created_at', dismissed.incidents)
    const { count } = await q
    incidentsCount = count ?? 0
  }

  // ── inventory ─────────────────────────────────────────────────
  let inventoryCount = 0
  if (isAdmin) {
    let q = supabase.from('inventory_items').select('id, current_qty, min_qty, last_updated')
    if (dismissed.inventory) {
      q = q.gt('last_updated', dismissed.inventory) as typeof q
    }
    const { data: lowItems } = await q
    inventoryCount = (lowItems ?? []).filter(
      item => typeof item.current_qty === 'number' && typeof item.min_qty === 'number' && item.current_qty <= item.min_qty
    ).length
  }

  return NextResponse.json({
    schedule:        scheduleCount,
    applications:    applicationsCount,
    inventory:       inventoryCount,
    requests:        requestsCount,
    notices:         noticesCount ?? 0,
    worker_requests: workerRequestsCount,
    incidents:       incidentsCount,
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
