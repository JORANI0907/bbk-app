import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, isResponse, ok, fail, errorMessage } from '@/lib/regulations/server'

const CATEGORIES = ['legal_hr', 'sop', 'customer_policy'] as const
const VISIBILITIES = ['admin', 'worker', 'customer', 'public'] as const
const CODE_RE = /^[A-Z]{2,4}-\d{2,3}$/

// GET /api/admin/regulations?category=sop — 규정 목록 (현재 발행본 메타 + draft 유무)
export async function GET(request: NextRequest) {
  const auth = requireAdmin({ allowWorker: true })
  if (isResponse(auth)) return auth

  try {
    const category = request.nextUrl.searchParams.get('category')
    const supabase = createServiceClient()

    let query = supabase
      .from('regulations')
      .select('*, current:regulation_versions!regulations_current_version_fk(version_no, effective_date, published_at)')
      .is('deleted_at', null)
      .order('category')
      .order('sort_order')
      .order('code')
    if (category && (CATEGORIES as readonly string[]).includes(category)) {
      query = query.eq('category', category)
    }
    const { data, error } = await query
    if (error) return fail(error.message, 500)

    const ids = (data ?? []).map((r) => r.id)
    const { data: drafts } = ids.length
      ? await supabase.from('regulation_versions').select('regulation_id, updated_at').eq('status', 'draft').in('regulation_id', ids)
      : { data: [] as Array<{ regulation_id: string; updated_at: string }> }
    const draftById = new Map((drafts ?? []).map((d) => [d.regulation_id, d.updated_at]))

    return ok((data ?? []).map((r) => ({ ...r, draft_updated_at: draftById.get(r.id) ?? null })))
  } catch (e) {
    return fail(errorMessage(e), 500)
  }
}

// POST /api/admin/regulations — 규정 생성 (+ 빈 draft v1)
export async function POST(request: NextRequest) {
  const auth = requireAdmin()
  if (isResponse(auth)) return auth

  try {
    const body = (await request.json()) as Record<string, unknown>
    const code = String(body.code ?? '').trim().toUpperCase()
    const title = String(body.title ?? '').trim()
    const category = String(body.category ?? '')
    const visibility = String(body.visibility ?? 'admin')
    const summary = typeof body.summary === 'string' ? body.summary.trim() : null

    if (!CODE_RE.test(code)) return fail('규정 코드는 HR-01 형식이어야 합니다.')
    if (!title) return fail('규정명은 필수입니다.')
    if (!(CATEGORIES as readonly string[]).includes(category)) return fail('분류가 올바르지 않습니다.')
    if (!(VISIBILITIES as readonly string[]).includes(visibility)) return fail('공개 범위가 올바르지 않습니다.')

    const supabase = createServiceClient()
    const { data: regulation, error } = await supabase
      .from('regulations')
      .insert({ code, title, category, visibility, summary, status: 'draft' })
      .select()
      .single()
    if (error || !regulation) {
      const dup = error?.code === '23505'
      return fail(dup ? `이미 사용 중인 코드입니다: ${code}` : (error?.message ?? '생성 실패'), dup ? 409 : 500)
    }

    const html = typeof body.html_body === 'string' ? body.html_body : ''
    const { error: vErr } = await supabase
      .from('regulation_versions')
      .insert({ regulation_id: regulation.id, version_no: 1, html_body: html, status: 'draft', change_summary: '제정' })
    if (vErr) return fail(vErr.message, 500)

    return ok(regulation, 201)
  } catch (e) {
    return fail(errorMessage(e), 500)
  }
}
