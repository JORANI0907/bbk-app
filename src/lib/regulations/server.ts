/**
 * 회사 규정 — 서버 전용 헬퍼 (API 라우트에서 공용).
 * 권한: 조회는 admin·worker, 편집·발행·삭제는 admin 만.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase/server'
import type { RegulationCategory, RegulationStatus, RegulationVisibility } from './articles'

export interface RegulationRow {
  id: string
  code: string
  title: string
  category: RegulationCategory
  visibility: RegulationVisibility
  summary: string | null
  status: RegulationStatus
  current_version_id: string | null
  sort_order: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface RegulationVersionRow {
  id: string
  regulation_id: string
  version_no: number
  html_body: string
  change_summary: string | null
  review_notes: string | null
  effective_date: string | null
  status: 'draft' | 'published'
  published_at: string | null
  published_by: string | null
  created_at: string
  updated_at: string
}

export type AdminSession = { userId: string; role: string; name: string }

/** 관리자 세션 확인. 실패 시 응답 객체를 돌려준다 (호출부에서 그대로 return). */
export function requireAdmin(opts: { allowWorker?: boolean } = {}): AdminSession | NextResponse {
  const session = getServerSession()
  const roles = opts.allowWorker ? ['admin', 'worker'] : ['admin']
  if (!session || !roles.includes(session.role)) {
    return NextResponse.json({ success: false, error: '권한이 없습니다.' }, { status: 403 })
  }
  return session
}

export function isResponse(v: unknown): v is NextResponse {
  return v instanceof NextResponse
}

export function fail(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status })
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status })
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** 규정 1건 + 버전 메타 목록(본문 제외) + draft·현재본 본문 */
export async function loadRegulationDetail(id: string) {
  const supabase = createServiceClient()
  const { data: regulation, error } = await supabase
    .from('regulations')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()
  if (error || !regulation) return null

  const { data: versions } = await supabase
    .from('regulation_versions')
    .select('id, regulation_id, version_no, change_summary, effective_date, status, published_at, published_by, created_at, updated_at')
    .eq('regulation_id', id)
    .order('version_no', { ascending: false })

  const ids = [
    (regulation as RegulationRow).current_version_id,
    (versions ?? []).find((v) => v.status === 'draft')?.id ?? null,
  ].filter((v): v is string => !!v)

  const { data: bodies } = ids.length
    ? await supabase.from('regulation_versions').select('id, html_body, review_notes').in('id', ids)
    : { data: [] as Array<{ id: string; html_body: string; review_notes: string | null }> }

  const bodyById = new Map((bodies ?? []).map((b) => [b.id, b]))
  const draft = (versions ?? []).find((v) => v.status === 'draft') ?? null
  const currentId = (regulation as RegulationRow).current_version_id

  return {
    regulation: regulation as RegulationRow,
    versions: (versions ?? []) as Omit<RegulationVersionRow, 'html_body'>[],
    draft: draft
      ? { ...draft, html_body: bodyById.get(draft.id)?.html_body ?? '', review_notes: bodyById.get(draft.id)?.review_notes ?? null }
      : null,
    current: currentId
      ? { id: currentId, html_body: bodyById.get(currentId)?.html_body ?? '' }
      : null,
  }
}
