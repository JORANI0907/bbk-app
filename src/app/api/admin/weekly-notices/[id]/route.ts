/**
 * Phase 1 v2 S2: 주간 공지 개별 항목 (편집 · 발행 취소)
 * PLAN v2 §4.2
 *
 * PATCH  /api/admin/weekly-notices/[id]
 *   body: { line1?, line2?, line3?, unpublish? }
 *   - 이미 발행된 것을 편집하려면 unpublish: true 로 발행 취소 후 편집
 *   - unpublish: true → published_at = null
 *
 * DELETE /api/admin/weekly-notices/[id] — 삭제 (미발행만)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { validateUuid } from '@/lib/ops/validators'

const MAX_LEN = 100

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

  for (const key of ['line1', 'line2', 'line3'] as const) {
    if (key in body) {
      const v = body[key]
      if (typeof v !== 'string' || v.trim().length === 0) {
        return NextResponse.json({ ok: false, error: `${key} 필수` }, { status: 400 })
      }
      if (v.length > MAX_LEN) {
        return NextResponse.json({ ok: false, error: `${key} 100자 이하` }, { status: 400 })
      }
      patch[key] = v.trim()
    }
  }

  if (body.unpublish === true) patch.published_at = null

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('weekly_notices')
    .update(patch)
    .eq('id', idCheck.value)
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, notice: data })
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const guard = requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const idCheck = validateUuid(params.id, 'id')
  if (!idCheck.ok) return NextResponse.json({ ok: false, error: idCheck.error, code: idCheck.code }, { status: 400 })

  const supabase = createServiceClient()

  const { data: row } = await supabase
    .from('weekly_notices')
    .select('id, published_at')
    .eq('id', idCheck.value)
    .maybeSingle()

  if (!row) return NextResponse.json({ ok: false, error: '없음' }, { status: 404 })
  if (row.published_at) {
    return NextResponse.json({ ok: false, error: '발행된 공지는 삭제할 수 없습니다. 먼저 발행 취소하세요.', code: 'PUBLISHED_CANNOT_DELETE' }, { status: 409 })
  }

  const { error } = await supabase.from('weekly_notices').delete().eq('id', idCheck.value)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
