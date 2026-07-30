/**
 * Phase 1 v2 S5: 지표 설정 API
 * PLAN v2 §4.6
 *
 * GET   /api/admin/ops/settings/metrics — 전체 목록
 * PATCH /api/admin/ops/settings/metrics — key로 부분 업데이트 (alive/show_on_dashboard/target_value)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

function requireAdmin() {
  const session = getServerSession()
  if (!session) return { ok: false as const, status: 401, error: '인증 필요' }
  if (session.role !== 'admin') return { ok: false as const, status: 403, error: '관리자만' }
  return { ok: true as const, session }
}

export async function GET() {
  const guard = requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('metrics_config')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, metrics: data ?? [] })
}

export async function PATCH(request: NextRequest) {
  const guard = requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const body = await request.json().catch(() => ({}))
  const key = typeof body.key === 'string' ? body.key : ''
  if (!key) return NextResponse.json({ ok: false, error: 'key 필수' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('alive' in body) patch.alive = !!body.alive
  if ('show_on_dashboard' in body) patch.show_on_dashboard = !!body.show_on_dashboard
  if ('target_value' in body) {
    const v = body.target_value
    if (v !== null && Number.isNaN(Number(v))) {
      return NextResponse.json({ ok: false, error: 'target_value 숫자 오류' }, { status: 400 })
    }
    patch.target_value = v === null ? null : Number(v)
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('metrics_config')
    .update(patch)
    .eq('key', key)
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, metric: data })
}
