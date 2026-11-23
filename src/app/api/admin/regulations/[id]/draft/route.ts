import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, isResponse, ok, fail, errorMessage } from '@/lib/regulations/server'

interface RouteParams { params: { id: string } }

/**
 * PUT /api/admin/regulations/[id]/draft — 편집 중 본문 저장.
 *   draft 가 없으면 (마지막 버전 번호 + 1) 로 새 draft 를 만든다. 발행본은 절대 수정하지 않는다.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const auth = requireAdmin()
  if (isResponse(auth)) return auth

  try {
    const body = (await request.json()) as Record<string, unknown>
    const htmlBody = typeof body.html_body === 'string' ? body.html_body : null
    const changeSummary = typeof body.change_summary === 'string' ? body.change_summary.slice(0, 500) : undefined
    const effectiveDate = typeof body.effective_date === 'string' && body.effective_date ? body.effective_date : undefined
    const reviewNotes = typeof body.review_notes === 'string' ? body.review_notes.slice(0, 5000) : undefined
    if (htmlBody === null && changeSummary === undefined && effectiveDate === undefined && reviewNotes === undefined) {
      return fail('저장할 내용이 없습니다.')
    }

    const supabase = createServiceClient()
    const { data: draft } = await supabase
      .from('regulation_versions')
      .select('id')
      .eq('regulation_id', params.id)
      .eq('status', 'draft')
      .maybeSingle()

    const updates: Record<string, unknown> = {}
    if (htmlBody !== null) updates.html_body = htmlBody
    if (changeSummary !== undefined) updates.change_summary = changeSummary
    if (effectiveDate !== undefined) updates.effective_date = effectiveDate
    if (reviewNotes !== undefined) updates.review_notes = reviewNotes

    if (draft) {
      const { data, error } = await supabase
        .from('regulation_versions')
        .update(updates)
        .eq('id', draft.id)
        .select('id, version_no, updated_at')
        .single()
      if (error) return fail(error.message, 500)
      return ok(data)
    }

    const { data: last } = await supabase
      .from('regulation_versions')
      .select('version_no, html_body')
      .eq('regulation_id', params.id)
      .order('version_no', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data, error } = await supabase
      .from('regulation_versions')
      .insert({
        regulation_id: params.id,
        version_no: (last?.version_no ?? 0) + 1,
        html_body: htmlBody ?? last?.html_body ?? '',
        change_summary: changeSummary ?? null,
        effective_date: effectiveDate ?? null,
        review_notes: reviewNotes ?? null,
        status: 'draft',
      })
      .select('id, version_no, updated_at')
      .single()
    if (error) return fail(error.message, 500)
    return ok(data, 201)
  } catch (e) {
    return fail(errorMessage(e), 500)
  }
}
