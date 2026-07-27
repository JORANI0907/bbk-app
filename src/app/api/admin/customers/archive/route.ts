import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * Phase 4: 고객 소프트 아카이빙 (bulk).
 * POST /api/admin/customers/archive  body: { ids: string[], archived_by?: string }
 *   → 선택된 customers의 archived_at을 now()로 설정 (고객DB이력으로 이동)
 * DELETE /api/admin/customers/archive body: { ids: string[] }
 *   → 이관 취소 (archived_at을 NULL로)
 * 데이터 자체는 이동하지 않음 — 참조 무결성 유지
 */

async function bulkUpdate(ids: string[], patch: Record<string, unknown>) {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('customers')
    .update(patch)
    .in('id', ids)
    .is('deleted_at', null)
  return error
}

export async function POST(request: NextRequest) {
  let body: { ids?: string[]; archived_by?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON parse error' }, { status: 400 }) }
  const ids = body.ids ?? []
  if (ids.length === 0) return NextResponse.json({ error: 'ids가 필요합니다.' }, { status: 400 })

  const err = await bulkUpdate(ids, {
    archived_at: new Date().toISOString(),
    archived_by: body.archived_by ?? null,
  })
  if (err) return NextResponse.json({ error: err.message }, { status: 500 })
  return NextResponse.json({ success: true, count: ids.length })
}

export async function DELETE(request: NextRequest) {
  let body: { ids?: string[] }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON parse error' }, { status: 400 }) }
  const ids = body.ids ?? []
  if (ids.length === 0) return NextResponse.json({ error: 'ids가 필요합니다.' }, { status: 400 })

  const err = await bulkUpdate(ids, { archived_at: null, archived_by: null })
  if (err) return NextResponse.json({ error: err.message }, { status: 500 })
  return NextResponse.json({ success: true, count: ids.length })
}
