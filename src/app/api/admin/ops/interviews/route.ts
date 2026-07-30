/**
 * Phase 1 v2 S5 부속: 분기 면담(quarterly_interviews) API
 * PLAN v2 §4.6
 *
 * GET  /api/admin/ops/interviews — 리스트 (quarter DESC, held_at DESC)
 * POST /api/admin/ops/interviews — 신규 저장 (admin 전용)
 *
 * quarter 형식: '2026-Q3'
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { validateUuid } from '@/lib/ops/validators'

function requireAdmin() {
  const session = getServerSession()
  if (!session) return { ok: false as const, status: 401, error: '인증 필요' }
  if (session.role !== 'admin') return { ok: false as const, status: 403, error: '관리자만' }
  return { ok: true as const, session }
}

const QUARTER_RE = /^\d{4}-Q[1-4]$/

export async function GET(request: NextRequest) {
  const guard = requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const supabase = createServiceClient()
  const url = new URL(request.url)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)

  const { data, error } = await supabase
    .from('quarterly_interviews')
    .select(`
      id, quarter, user_id, held_at,
      q1_hardest, q2_wish, q3_future, company_action,
      notified_at, created_at
    `)
    .order('quarter', { ascending: false })
    .order('held_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, interviews: data ?? [] })
}

export async function POST(request: NextRequest) {
  const guard = requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const body = await request.json().catch(() => ({}))

  const quarter = String(body.quarter ?? '')
  if (!QUARTER_RE.test(quarter)) {
    return NextResponse.json({ ok: false, error: 'quarter 형식 오류 (예: 2026-Q3)' }, { status: 400 })
  }

  const userIdCheck = validateUuid(body.user_id, 'user_id')
  if (!userIdCheck.ok) return NextResponse.json({ ok: false, error: userIdCheck.error, code: userIdCheck.code }, { status: 400 })

  const heldAt = String(body.held_at ?? '')
  if (!heldAt) return NextResponse.json({ ok: false, error: 'held_at 필수' }, { status: 400 })

  const payload = {
    quarter,
    user_id: userIdCheck.value,
    held_at: heldAt,
    q1_hardest: typeof body.q1_hardest === 'string' ? body.q1_hardest : null,
    q2_wish: typeof body.q2_wish === 'string' ? body.q2_wish : null,
    q3_future: typeof body.q3_future === 'string' ? body.q3_future : null,
    company_action: typeof body.company_action === 'string' ? body.company_action : null,
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('quarterly_interviews')
    .insert(payload)
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, interview: data })
}
