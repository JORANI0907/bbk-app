/**
 * Phase 1 v2 S5: 대표 의도 설정 API
 * PLAN v2 §4.6
 *
 * GET  /api/admin/ops/settings/intent — 현재 값 조회 (id=1 단일 행)
 * POST /api/admin/ops/settings/intent — upsert (admin 전용)
 *
 * 필드: purpose, intent_1/2/3, intent_*_tradeoff, never_1/2/3, always_1/2/3, year, safe_days_start_date
 * 길이 CHECK: 각 텍스트 필드는 서버에서 200자 제한.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

const TEXT_LIMIT = 200

const TEXT_FIELDS = [
  'purpose',
  'intent_1', 'intent_2', 'intent_3',
  'intent_1_tradeoff', 'intent_2_tradeoff', 'intent_3_tradeoff',
  'never_1', 'never_2', 'never_3',
  'always_1', 'always_2', 'always_3',
] as const

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
  const { data, error } = await supabase.from('company_intent').select('*').eq('id', 1).maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, intent: data })
}

export async function POST(request: NextRequest) {
  const guard = requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const body = await request.json().catch(() => ({}))
  const payload: Record<string, unknown> = { id: 1, updated_at: new Date().toISOString() }

  for (const key of TEXT_FIELDS) {
    if (key in body) {
      const v = body[key]
      if (v !== null && typeof v !== 'string') {
        return NextResponse.json({ ok: false, error: `${key} 문자열이어야 합니다.` }, { status: 400 })
      }
      if (typeof v === 'string' && v.length > TEXT_LIMIT) {
        return NextResponse.json({ ok: false, error: `${key} 는 ${TEXT_LIMIT}자 이하` }, { status: 400 })
      }
      payload[key] = v ?? ''
    }
  }

  if ('year' in body) {
    const y = Number(body.year)
    if (!Number.isInteger(y) || y < 2020 || y > 2100) {
      return NextResponse.json({ ok: false, error: 'year 범위 오류' }, { status: 400 })
    }
    payload.year = y
  }

  if ('safe_days_start_date' in body) {
    const d = String(body.safe_days_start_date ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      return NextResponse.json({ ok: false, error: 'safe_days_start_date 형식 오류' }, { status: 400 })
    }
    payload.safe_days_start_date = d
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('company_intent')
    .upsert(payload, { onConflict: 'id' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, intent: data })
}
