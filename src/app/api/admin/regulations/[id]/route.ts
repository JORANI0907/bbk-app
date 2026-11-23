import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, isResponse, ok, fail, errorMessage, loadRegulationDetail } from '@/lib/regulations/server'

interface RouteParams { params: { id: string } }

const META_FIELDS = ['title', 'visibility', 'summary', 'status', 'sort_order', 'category'] as const

// GET /api/admin/regulations/[id] — 규정 + 버전 목록 + draft/현재본 본문
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const auth = requireAdmin({ allowWorker: true })
  if (isResponse(auth)) return auth

  try {
    const detail = await loadRegulationDetail(params.id)
    if (!detail) return fail('규정을 찾을 수 없습니다.', 404)
    return ok(detail)
  } catch (e) {
    return fail(errorMessage(e), 500)
  }
}

// PATCH /api/admin/regulations/[id] — 메타 수정 (본문은 /draft)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = requireAdmin()
  if (isResponse(auth)) return auth

  try {
    const body = (await request.json()) as Record<string, unknown>
    const updates: Record<string, unknown> = {}
    for (const key of META_FIELDS) {
      if (key in body) updates[key] = body[key]
    }
    if (typeof updates.title === 'string' && !updates.title.trim()) return fail('규정명은 비울 수 없습니다.')
    if (Object.keys(updates).length === 0) return fail('수정할 항목이 없습니다.')

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('regulations')
      .update(updates)
      .eq('id', params.id)
      .is('deleted_at', null)
      .select()
      .single()
    if (error) return fail(error.message, error.code === 'PGRST116' ? 404 : 500)
    return ok(data)
  } catch (e) {
    return fail(errorMessage(e), 500)
  }
}

// DELETE /api/admin/regulations/[id] — 삭제 표시 (본문·이력은 보존)
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const auth = requireAdmin()
  if (isResponse(auth)) return auth

  try {
    const supabase = createServiceClient()
    const { error } = await supabase
      .from('regulations')
      .update({ deleted_at: new Date().toISOString(), status: 'retired' })
      .eq('id', params.id)
      .is('deleted_at', null)
    if (error) return fail(error.message, 500)
    return ok({ id: params.id })
  } catch (e) {
    return fail(errorMessage(e), 500)
  }
}
