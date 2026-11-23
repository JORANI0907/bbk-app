import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, isResponse, ok, fail, errorMessage } from '@/lib/regulations/server'
import { validateArticleNumbers } from '@/lib/regulations/articles'

interface RouteParams { params: { id: string } }

/**
 * POST /api/admin/regulations/[id]/publish — draft 를 발행본으로.
 *   body: { effective_date: 'YYYY-MM-DD', change_summary?: string }
 *   조 번호가 빠지거나 중복이면 400 (force: true 로 강행 가능).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = requireAdmin()
  if (isResponse(auth)) return auth

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const effectiveDate = typeof body.effective_date === 'string' ? body.effective_date : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return fail('시행일(YYYY-MM-DD)은 필수입니다.')

    const supabase = createServiceClient()
    const { data: draft } = await supabase
      .from('regulation_versions')
      .select('id, html_body, version_no')
      .eq('regulation_id', params.id)
      .eq('status', 'draft')
      .maybeSingle()
    if (!draft) return fail('발행할 편집본이 없습니다.', 404)
    if (!draft.html_body.trim()) return fail('본문이 비어 있습니다.')

    const check = validateArticleNumbers(draft.html_body)
    if (!body.force && (check.missing.length || check.duplicated.length)) {
      return fail(
        `조 번호를 확인하세요. 빠짐: ${check.missing.map((n) => `제${n}조`).join(', ') || '없음'} / 중복: ${check.duplicated.join(', ') || '없음'}`,
        400,
      )
    }

    const now = new Date().toISOString()
    const { error: vErr } = await supabase
      .from('regulation_versions')
      .update({
        status: 'published',
        effective_date: effectiveDate,
        published_at: now,
        published_by: auth.userId,
        ...(typeof body.change_summary === 'string' ? { change_summary: body.change_summary.slice(0, 500) } : {}),
      })
      .eq('id', draft.id)
    if (vErr) return fail(vErr.message, 500)

    const { data, error } = await supabase
      .from('regulations')
      .update({ current_version_id: draft.id, status: 'active' })
      .eq('id', params.id)
      .select()
      .single()
    if (error) return fail(error.message, 500)

    return ok({ regulation: data, version_id: draft.id, version_no: draft.version_no })
  } catch (e) {
    return fail(errorMessage(e), 500)
  }
}
