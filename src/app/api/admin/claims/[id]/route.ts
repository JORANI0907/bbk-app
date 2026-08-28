/**
 * Phase 1 v2 S4: 고객 클레임 단일 항목 API
 * PLAN v2 §4.4
 *
 * PATCH  /api/admin/claims/[id] — 편집 (content, category, cause, is_rework, resolved_at)
 * DELETE /api/admin/claims/[id] — 삭제 (admin only)
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

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const idCheck = validateUuid(params.id, 'id')
  if (!idCheck.ok) return NextResponse.json({ ok: false, error: idCheck.error, code: idCheck.code }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if ('content' in body) {
    const v = String(body.content ?? '').trim()
    if (!v) return NextResponse.json({ ok: false, error: 'content 필수' }, { status: 400 })
    if (v.length > 2000) return NextResponse.json({ ok: false, error: 'content 2000자 이하' }, { status: 400 })
    patch.content = v
  }
  if ('category' in body) patch.category = body.category === null ? null : String(body.category)
  if ('cause' in body) patch.cause = body.cause === null ? null : String(body.cause)
  if ('is_rework' in body) patch.is_rework = !!body.is_rework
  if ('resolved_at' in body) {
    patch.resolved_at = body.resolved_at ? new Date(body.resolved_at).toISOString() : null
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('claims')
    .update(patch)
    .eq('id', idCheck.value)
    .select(`*, customer:customers(id, business_name, contact_name, contact_phone)`)
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, claim: data })
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const guard = requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const idCheck = validateUuid(params.id, 'id')
  if (!idCheck.ok) return NextResponse.json({ ok: false, error: idCheck.error, code: idCheck.code }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase.from('claims').delete().eq('id', idCheck.value)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
