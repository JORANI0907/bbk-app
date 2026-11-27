/**
 * 계약서 양식의 "규정 변수" 치환 — 순수 함수 (DB·DOM 의존 없음, 단위 테스트 대상).
 *
 * 양식(contract_templates.html_body)에 쓰는 변수:
 *   {{규정:CP-03:9}}    → CP-03 의 제9조 조문 전체를 인용문으로 삽입 (숫자의 출처를 규정 한 곳에 둔다)
 *   {{규정버전:CP-03}}  → "CP-03 예약 취소·변경 및 환불 정책 (제1판, 2026-12-01 시행)"
 *   {{준거문서표}}       → 계약이 참조하는 규정 목록 표 (문서 / 판·시행일 / 열람 방법)
 *   {{서비스유형}}       → 고객 유형(정기딥케어·정기엔드케어). 없으면 "정기 서비스"
 *
 * 치환에 쓴 규정 본문은 계약 스냅샷(contract_snapshot.regulation_docs)에 그대로 저장해
 * 서명 당시 내용을 고정한다. 규정은 공개하지 않고, 서명 링크를 받은 고객만 서명 화면에서 본다.
 */
import { parseArticles, renderRegulationHtml, formatKoreanDate } from '@/lib/regulations/articles'

export type RegulationDocStatus = 'published' | 'draft'

/** 계약 스냅샷에 저장되는 규정 1건 (서명 당시 판 고정) */
export interface RegulationDocSnapshot {
  code: string
  title: string
  version_id: string
  version_no: number
  status: RegulationDocStatus
  effective_date: string | null
  html: string
}

/** 서명 전 고객이 체크해야 하는 확인 항목 (양식 var_config.key_clauses 에서 옴) */
export interface KeyClause {
  key: string
  label: string
}

/** 양식 var_config 중 규정 연동에 쓰는 부분 */
export interface TemplateRegulationConfig {
  regulation_refs?: string[]
  optional_refs?: Array<{ code: string; when?: string }>
  key_clauses?: KeyClause[]
}

export interface ApplyRegulationVarsInput {
  html: string
  docs: RegulationDocSnapshot[]
  serviceType?: string | null
}

export interface ApplyRegulationVarsResult {
  html: string
  /** 치환하지 못한 변수 원문 (규정 없음·조 없음) */
  unresolved: string[]
}

const CODE = '[A-Z]{2,4}-\\d{2,3}'
export const REGULATION_ARTICLE_VAR_RE = new RegExp(`\\{\\{\\s*규정:(${CODE}):(\\d+(?:의\\d+)?)\\s*\\}\\}`, 'g')
export const REGULATION_VERSION_VAR_RE = new RegExp(`\\{\\{\\s*규정버전:(${CODE})\\s*\\}\\}`, 'g')
export const REFERENCE_TABLE_VAR_RE = /\{\{\s*준거문서표\s*\}\}/g
export const SERVICE_TYPE_VAR_RE = /\{\{\s*서비스유형\s*\}\}/g

const DEFAULT_SERVICE_TYPE = '정기 서비스'
const VIEW_METHOD = '서명 화면에서 열람 · 완료본과 함께 교부'

/** 본문에 규정 변수가 하나라도 있는지 */
export function hasRegulationVars(html: string): boolean {
  return [REGULATION_ARTICLE_VAR_RE, REGULATION_VERSION_VAR_RE, REFERENCE_TABLE_VAR_RE, SERVICE_TYPE_VAR_RE]
    .some((re) => new RegExp(re.source).test(html))
}

/** 본문의 규정 변수가 가리키는 규정 코드 목록 (중복 제거) */
export function findRegulationCodes(html: string): string[] {
  const codes = new Set<string>()
  for (const m of html.matchAll(new RegExp(REGULATION_ARTICLE_VAR_RE.source, 'g'))) codes.add(m[1])
  for (const m of html.matchAll(new RegExp(REGULATION_VERSION_VAR_RE.source, 'g'))) codes.add(m[1])
  return Array.from(codes)
}

/**
 * 계약이 참조해야 하는 규정 코드 전체 = 양식 설정의 필수 목록 + 본문 변수가 가리키는 것
 * (+ 공동계약이면 선택 목록). 순서는 설정 순서를 우선한다.
 */
export function collectRequiredCodes(
  html: string,
  config: TemplateRegulationConfig | null | undefined,
  opts: { jointContract?: boolean } = {},
): string[] {
  const ordered: string[] = []
  const push = (c: string) => { if (c && !ordered.includes(c)) ordered.push(c) }
  for (const c of config?.regulation_refs ?? []) push(c)
  if (opts.jointContract) for (const o of config?.optional_refs ?? []) push(o.code)
  for (const c of findRegulationCodes(html)) push(c)
  return ordered
}

type LabelDoc = Pick<RegulationDocSnapshot, 'code' | 'title' | 'version_no' | 'status' | 'effective_date'>

function editionText(doc: LabelDoc): string {
  const edition = doc.status === 'draft' ? `초안 제${doc.version_no}판` : `제${doc.version_no}판`
  const date = doc.effective_date ? `, ${doc.effective_date} 시행` : ''
  return `(${edition}${date})`
}

/** 관리자용 — "CP-03 예약 취소·변경 및 환불 정책 (제1판, 2026-12-01 시행)". 초안이면 "(초안 제1판)" */
export function formatRegulationLabel(doc: LabelDoc): string {
  return `${doc.code} ${doc.title} ${editionText(doc)}`
}

/** 고객용 — 코드 없이 "예약 취소·변경 및 환불 정책 (제1판, 2026-12-01 시행)". 고객에게 CP-03 같은 내부 코드는 보이지 않는다 */
export function formatRegulationTitle(doc: LabelDoc): string {
  return `${doc.title} ${editionText(doc)}`
}

/**
 * 고객에게 보여 줄 HTML/문장에서 내부 규정 코드를 지운다.
 * 규정 원문은 "「CP-03 예약 취소…」" 처럼 코드로 서로를 가리키지만(단일 출처 추적용),
 * 고객 화면·PDF 에서는 제목만 보이게 한다. 코드 뒤에 한글 제목이 이어지는 경우만 지운다.
 */
export function stripRegulationCodes(text: string): string {
  return text
    .replace(/(?:CP|OP|HR)-\d{2,3}\s+(?=[가-힣])/g, '')
    .replace(/\((?:예|예시):\s*(?:CP|OP|HR)-\d{2,3}\)/g, '')
}

/** 규정 본문에서 "제N조" 블록(제목 <p> 부터 다음 조 직전까지)을 찾는다 */
export function extractArticleHtml(regulationHtml: string, articleNo: string, effectiveDate: string | null): string | null {
  const wanted = `제${articleNo}조`
  const found = parseArticles(regulationHtml).find((a) => a.number === wanted)
  if (!found) return null
  return renderRegulationHtml(found.html, effectiveDate)
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** 준거 문서 표 — 열람 주소 대신 열람 방법을 적는다 (규정은 공개하지 않음) */
export function buildReferenceTable(docs: RegulationDocSnapshot[]): string {
  const head = ['문서', '판 · 시행일', '열람 방법'].map((h) => `<td><p><strong>${h}</strong></p></td>`).join('')
  const rows = docs.map((d) => {
    const edition = d.status === 'draft' ? `초안 제${d.version_no}판` : `제${d.version_no}판`
    const date = d.effective_date ? ` · ${formatKoreanDate(d.effective_date)} 시행` : ''
    return `<tr><td><p>${escapeHtml(d.title)}</p></td><td><p>${edition}${date}</p></td><td><p>${VIEW_METHOD}</p></td></tr>`
  }).join('')
  return `<table><tbody><tr>${head}</tr>${rows}</tbody></table>`
}

/** 규정 변수 4종을 모두 치환한다. 못 찾은 변수는 원문 그대로 두고 unresolved 에 모은다. */
export function applyRegulationVars(input: ApplyRegulationVarsInput): ApplyRegulationVarsResult {
  const byCode = new Map(input.docs.map((d) => [d.code, d]))
  const unresolved: string[] = []

  let html = input.html.replace(new RegExp(REGULATION_ARTICLE_VAR_RE.source, 'g'), (raw, code: string, no: string) => {
    const doc = byCode.get(code)
    const article = doc ? extractArticleHtml(doc.html, no, doc.effective_date) : null
    if (!doc || !article) { unresolved.push(raw); return raw }
    const caption = `<p style="font-size:12px;color:#666;margin:0 0 4px;">[${escapeHtml(formatRegulationTitle(doc))} 인용]</p>`
    return `<blockquote>${caption}${stripRegulationCodes(article)}</blockquote>`
  })

  html = html.replace(new RegExp(REGULATION_VERSION_VAR_RE.source, 'g'), (raw, code: string) => {
    const doc = byCode.get(code)
    if (!doc) { unresolved.push(raw); return raw }
    return escapeHtml(formatRegulationTitle(doc))
  })

  html = html.replace(REFERENCE_TABLE_VAR_RE, () => (
    input.docs.length > 0 ? buildReferenceTable(input.docs) : '<p>(준거 문서 없음)</p>'
  ))

  const serviceType = input.serviceType?.trim() || DEFAULT_SERVICE_TYPE
  html = html.replace(SERVICE_TYPE_VAR_RE, escapeHtml(serviceType))

  return { html, unresolved }
}

/** 양식 설정의 확인 항목을 정리한다 (빈 값 제거, key 중복 제거) */
export function normalizeKeyClauses(raw: unknown): KeyClause[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: KeyClause[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const key = String((item as KeyClause).key ?? '').trim()
    const label = String((item as KeyClause).label ?? '').trim()
    if (!key || !label || seen.has(key)) continue
    seen.add(key)
    out.push({ key, label })
  }
  return out
}

/** 고객이 보낸 체크 목록이 필수 항목을 모두 포함하는지. 빠진 key 를 돌려준다 */
export function findMissingAgreements(required: KeyClause[], checked: readonly string[]): string[] {
  const set = new Set(checked)
  return required.filter((c) => !set.has(c.key)).map((c) => c.key)
}

/**
 * 서명 완료 PDF 뒤에 붙일 별첨 HTML — 참조한 규정 전문. 계약서 본문은 짧게 두고
 * 약관 전문은 별첨으로 교부한다 (약관규제법 교부 요건).
 */
export function buildRegulationAppendixHtml(docs: RegulationDocSnapshot[]): string {
  if (docs.length === 0) return ''
  const sections = docs.map((d, i) => `
<div style="page-break-before:always;">
  <h2 style="font-size:15px;margin:0 0 4px;">별첨 ${i + 1}. ${escapeHtml(d.title)}</h2>
  <p style="font-size:11px;color:#666;margin:0 0 12px;">${escapeHtml(formatRegulationTitle(d))} · 계약서 서명 당시 판</p>
  <div style="font-size:12px;line-height:1.7;">${stripRegulationCodes(renderRegulationHtml(d.html, d.effective_date))}</div>
</div>`).join('')
  return `<!-- BBK_BLOCK_START:regulation-appendix -->${sections}<!-- BBK_BLOCK_END:regulation-appendix -->`
}
