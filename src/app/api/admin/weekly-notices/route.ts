/**
 * Phase 1 v2 S2: 사내 주간 공지 (규정 제7조 · SPEC 4.3)
 * PLAN v2 §4.2
 *
 * GET  /api/admin/weekly-notices?limit=N — 최근 목록 (published_at DESC, week_start DESC)
 * POST /api/admin/weekly-notices — 신규 초안 저장 (upsert by week_start)
 *
 * body: { week_start, line1, line2, line3, ai_draft_used?, original_draft? }
 * - 각 라인 100자 하드 제한 (DB CHECK 도 있지만 클라이언트 UX 위해 서버에서 재검증)
 * - week_start UNIQUE → 같은 주에 중복 저장 시 update
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

const MAX_LEN = 100
const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/

function requireAdmin() {
  const session = getServerSession()
  if (!session) return { ok: false as const, status: 401, error: '인증 필요' }
  if (session.role !== 'admin') return { ok: false as const, status: 403, error: '관리자만' }
  return { ok: true as const, session }
}

function validateLine(v: unknown, name: string): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof v !== 'string') return { ok: false, error: `${name} 문자열이어야 합니다.` }
  const trimmed = v.trim()
  if (trimmed.length === 0) return { ok: false, error: `${name} 필수 입력` }
  if (trimmed.length > MAX_LEN) return { ok: false, error: `${name} 100자 이하로 작성해주세요.` }
  return { ok: true, value: trimmed }
}

export async function GET(request: NextRequest) {
  const guard = requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const url = new URL(request.url)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), 100)

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('weekly_notices')
    .select('id, week_start, line1, line2, line3, author_id, ai_draft_used, published_at, created_at, updated_at')
    .order('week_start', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, notices: data ?? [] })
}

export async function POST(request: NextRequest) {
  const guard = requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const body = await request.json().catch(() => ({}))

  const weekStart = String(body.week_start ?? '')
  if (!WEEK_RE.test(weekStart)) {
    return NextResponse.json({ ok: false, error: 'week_start 형식 오류 (YYYY-MM-DD)' }, { status: 400 })
  }

  const c1 = validateLine(body.line1, 'line1'); if (!c1.ok) return NextResponse.json({ ok: false, error: c1.error }, { status: 400 })
  const c2 = validateLine(body.line2, 'line2'); if (!c2.ok) return NextResponse.json({ ok: false, error: c2.error }, { status: 400 })
  const c3 = validateLine(body.line3, 'line3'); if (!c3.ok) return NextResponse.json({ ok: false, error: c3.error }, { status: 400 })

  const supabase = createServiceClient()
  const payload = {
    week_start: weekStart,
    line1: c1.value,
    line2: c2.value,
    line3: c3.value,
    author_id: guard.session.userId,
    ai_draft_used: !!body.ai_draft_used,
    original_draft: body.original_draft ?? null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('weekly_notices')
    .upsert(payload, { onConflict: 'week_start' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, notice: data })
}
