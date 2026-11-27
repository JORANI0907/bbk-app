/**
 * 규정 변수 치환의 서버 쪽 — DB 에서 규정 본문을 읽어 순수 함수(contract-regulation-vars.ts)에 넘긴다.
 * 발행본(current_version_id)을 우선 쓰고, 없으면 allowDraft 일 때만 최신 초안을 쓴다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  applyRegulationVars, collectRequiredCodes, normalizeKeyClauses,
  type KeyClause, type RegulationDocSnapshot, type TemplateRegulationConfig,
} from '@/lib/contract-regulation-vars'

interface RegulationRow { id: string; code: string; title: string; current_version_id: string | null }
interface VersionRow { id: string; regulation_id: string; version_no: number; status: string; effective_date: string | null; html_body: string }

export interface LoadRegulationDocsResult {
  docs: RegulationDocSnapshot[]
  /** 코드는 있는데 쓸 수 있는 판이 없는 것 (발행본 없고 초안도 없음, 또는 초안 불허) */
  missing: string[]
}

/** 규정 코드 목록 → 스냅샷용 문서 목록. 발행본 우선, allowDraft 면 초안 허용 */
export async function loadRegulationDocs(
  supabase: SupabaseClient,
  codes: string[],
  opts: { allowDraft: boolean },
): Promise<LoadRegulationDocsResult> {
  if (codes.length === 0) return { docs: [], missing: [] }

  const { data: regs, error: regErr } = await supabase
    .from('regulations')
    .select('id, code, title, current_version_id')
    .in('code', codes)
    .is('deleted_at', null)
  if (regErr) throw new Error(`규정 조회 실패: ${regErr.message}`)
  const regRows = (regs ?? []) as RegulationRow[]

  const { data: versions, error: verErr } = await supabase
    .from('regulation_versions')
    .select('id, regulation_id, version_no, status, effective_date, html_body')
    .in('regulation_id', regRows.map((r) => r.id))
    .order('version_no', { ascending: false })
  if (verErr) throw new Error(`규정 판 조회 실패: ${verErr.message}`)
  const verRows = (versions ?? []) as VersionRow[]

  const docs: RegulationDocSnapshot[] = []
  const missing: string[] = []
  for (const code of codes) {
    const reg = regRows.find((r) => r.code === code)
    const picked = reg ? pickVersion(reg, verRows, opts.allowDraft) : null
    if (!reg || !picked) { missing.push(code); continue }
    docs.push({
      code: reg.code, title: reg.title, version_id: picked.id, version_no: picked.version_no,
      status: picked.status === 'published' ? 'published' : 'draft',
      effective_date: picked.effective_date, html: picked.html_body,
    })
  }
  return { docs, missing }
}

function pickVersion(reg: RegulationRow, versions: VersionRow[], allowDraft: boolean): VersionRow | null {
  const mine = versions.filter((v) => v.regulation_id === reg.id)
  const published = mine.find((v) => v.id === reg.current_version_id && v.status === 'published')
  if (published) return published
  if (!allowDraft) return null
  return mine.find((v) => v.status === 'draft') ?? null
}

export interface ResolveTemplateRegulationsInput {
  html: string
  varConfig: unknown
  serviceType?: string | null
  jointContract?: boolean
  allowDraft: boolean
}

export interface ResolveTemplateRegulationsResult {
  html: string
  docs: RegulationDocSnapshot[]
  agreementsRequired: KeyClause[]
  unresolved: string[]
  missing: string[]
  usedDraft: boolean
}

/** 양식 설정 + 본문을 받아 규정 변수를 채우고, 스냅샷에 넣을 규정 문서·확인 항목을 돌려준다 */
export async function resolveTemplateRegulations(
  supabase: SupabaseClient,
  input: ResolveTemplateRegulationsInput,
): Promise<ResolveTemplateRegulationsResult> {
  const config = (input.varConfig ?? {}) as TemplateRegulationConfig
  const codes = collectRequiredCodes(input.html, config, { jointContract: input.jointContract })
  const { docs, missing } = await loadRegulationDocs(supabase, codes, { allowDraft: input.allowDraft })
  const applied = applyRegulationVars({ html: input.html, docs, serviceType: input.serviceType })
  return {
    html: applied.html,
    docs,
    agreementsRequired: normalizeKeyClauses(config.key_clauses),
    unresolved: applied.unresolved,
    missing,
    usedDraft: docs.some((d) => d.status === 'draft'),
  }
}
