/**
 * Phase 1 v2 S4: 고객 클레임 API
 * PLAN v2 §4.4 (수정: incidents 통합 대신 claims 전용 페이지)
 *
 * GET  /api/admin/claims?open=1 — 리스트 (미해결 필터)
 * POST /api/admin/claims — 신규 등록
 *
 * 필드: occurred_at, content, category, cause, is_rework, resolved_at, customer_id, logged_by
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

export async function GET(request: NextRequest) {
  const guard = requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const url = new URL(request.url)
  const openOnly = url.searchParams.get('open') === '1'
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 500)

  const supabase = createServiceClient()
  let query = supabase
    .from('claims')
    .select(`
      id, occurred_at, content, category, cause, is_rework,
      resolved_at, logged_by, customer_id, created_at, updated_at,
      customer:customers(id, business_name, owner_name, phone)
    `)
    .order('occurred_at', { ascending: false })
    .limit(limit)

  if (openOnly) query = query.is('resolved_at', null)

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, claims: data ?? [] })
}

export async function POST(request: NextRequest) {
  const guard = requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const body = await request.json().catch(() => ({}))

  const customerCheck = validateUuid(body.customer_id, 'customer_id')
  if (!customerCheck.ok) return NextResponse.json({ ok: false, error: customerCheck.error, code: customerCheck.code }, { status: 400 })

  const occurredAt = String(body.occurred_at ?? '')
  if (!occurredAt) return NextResponse.json({ ok: false, error: 'occurred_at 필수' }, { status: 400 })
  const occurredIso = new Date(occurredAt).toISOString()

  const content = String(body.content ?? '').trim()
  if (!content) return NextResponse.json({ ok: false, error: 'content 필수' }, { status: 400 })
  if (content.length > 2000) return NextResponse.json({ ok: false, error: 'content 2000자 이하' }, { status: 400 })

  const payload = {
    customer_id: customerCheck.value,
    occurred_at: occurredIso,
    content,
    category: typeof body.category === 'string' ? body.category : null,
    cause: typeof body.cause === 'string' ? body.cause : null,
    is_rework: !!body.is_rework,
    resolved_at: body.resolved_at ? new Date(body.resolved_at).toISOString() : null,
    logged_by: guard.session.userId,
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('claims')
    .insert(payload)
    .select(`
      *, customer:customers(id, business_name, owner_name, phone)
    `)
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, claim: data })
}
