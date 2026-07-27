import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

/**
 * Phase 23: 고객 일시정지·재개
 * POST   /api/admin/customers/:id/pause   → status=paused, paused_at=now, 미래 방문 일정 soft-delete
 * DELETE /api/admin/customers/:id/pause   → status=active, paused_at=null (재개)
 *
 * 재개는 수동만. 자동 재개 없음.
 * 일시정지 중에는 신규 청구·일정 자동생성 훅에서 skip됨.
 */

async function getSessionSafe() {
  try {
    return getServerSession()
  } catch {
    return null
  }
}

export async function POST(request: NextRequest, ctx: { params: { id: string } }) {
  const session = await getSessionSafe()
  if (session?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const customerId = ctx.params.id
  if (!customerId) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

  const supabase = createServiceClient()
  const now = new Date().toISOString()
  const todayISO = now.slice(0, 10)

  // 1) customers status 갱신
  const { data: updated, error: uErr } = await supabase
    .from('customers')
    .update({ status: 'paused', paused_at: now, paused_by: session?.userId ?? null, updated_at: now })
    .eq('id', customerId)
    .is('deleted_at', null)
    .select('id, business_name, contact_phone')
    .single()

  if (uErr || !updated) {
    return NextResponse.json({ error: uErr?.message ?? '고객을 찾을 수 없음' }, { status: 500 })
  }

  // 2) 미래 방문 일정 soft-delete (오늘 이후 + 미완료)
  const { data: deletedApps } = await supabase
    .from('service_applications')
    .update({ deleted_at: now })
    .eq('customer_id', customerId)
    .gte('construction_date', todayISO)
    .neq('progress_status', '작업완료')
    .is('deleted_at', null)
    .select('id, construction_date')

  return NextResponse.json({
    success: true,
    customer: updated,
    deleted_future_visits: deletedApps?.length ?? 0,
  })
}

export async function DELETE(request: NextRequest, ctx: { params: { id: string } }) {
  const session = await getSessionSafe()
  if (session?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const customerId = ctx.params.id
  if (!customerId) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

  const supabase = createServiceClient()
  const now = new Date().toISOString()

  const { data: updated, error } = await supabase
    .from('customers')
    .update({ status: 'active', paused_at: null, paused_by: null, updated_at: now })
    .eq('id', customerId)
    .is('deleted_at', null)
    .select('id, business_name')
    .single()

  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? '고객을 찾을 수 없음' }, { status: 500 })
  }

  return NextResponse.json({ success: true, customer: updated })
}
