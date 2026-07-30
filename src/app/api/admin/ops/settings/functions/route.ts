/**
 * Phase 1 v2 S5: 기능(functions) 설정 API
 * PLAN v2 §4.6
 *
 * GET   /api/admin/ops/settings/functions — 15개 시드된 기능 목록 + 담당·백업 사용자
 * PATCH /api/admin/ops/settings/functions — code로 owner_user_id/backup_user_id 배정
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

export async function GET() {
  const guard = requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('functions')
    .select('code, kind, name, owner_user_id, backup_user_id, sort_order, updated_at')
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, functions: data ?? [] })
}

export async function PATCH(request: NextRequest) {
  const guard = requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const body = await request.json().catch(() => ({}))
  const code = typeof body.code === 'string' ? body.code : ''
  if (!code) return NextResponse.json({ ok: false, error: 'code 필수' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if ('owner_user_id' in body) {
    if (body.owner_user_id === null) {
      patch.owner_user_id = null
    } else {
      const check = validateUuid(body.owner_user_id, 'owner_user_id')
      if (!check.ok) return NextResponse.json({ ok: false, error: check.error, code: check.code }, { status: 400 })
      patch.owner_user_id = check.value
    }
  }

  if ('backup_user_id' in body) {
    if (body.backup_user_id === null) {
      patch.backup_user_id = null
    } else {
      const check = validateUuid(body.backup_user_id, 'backup_user_id')
      if (!check.ok) return NextResponse.json({ ok: false, error: check.error, code: check.code }, { status: 400 })
      patch.backup_user_id = check.value
    }
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('functions')
    .update(patch)
    .eq('code', code)
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, function: data })
}
