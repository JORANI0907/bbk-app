/**
 * 회사 규정 본문(HTML 조각) 처리 — 순수 함수만. DB·DOM 의존 없음 (단위 테스트 대상).
 *
 * 본문 규약 (scripts/regulations-seed/README.md):
 *   장: <h2>제1장 총칙</h2>
 *   조: <p><strong>제1조 (목적)</strong></p>  — "제N조", "제N조의M" 모두 허용
 *   항·호·목: 일반 <p>
 *   {{시행일}}: 발행 시 effective_date 로 치환
 */

export type RegulationCategory = 'legal_hr' | 'sop' | 'customer_policy'
export type RegulationVisibility = 'admin' | 'worker' | 'customer' | 'public'
export type RegulationStatus = 'draft' | 'active' | 'retired'

export const CATEGORY_LABELS: Record<RegulationCategory, string> = {
  legal_hr: '법정·인사',
  sop: '운영 규정',
  customer_policy: '고객 약관·정책',
}

export const VISIBILITY_LABELS: Record<RegulationVisibility, string> = {
  admin: '관리자만',
  worker: '직원 포털',
  customer: '고객 포털',
  public: '외부 공개',
}

export const STATUS_LABELS: Record<RegulationStatus, string> = {
  draft: '미발행',
  active: '시행 중',
  retired: '폐지',
}

export interface ArticleRef {
  /** 앵커용 id — 예: art-3, art-3-2 (제3조의2) */
  id: string
  /** "제3조의2" 처럼 표시용 번호 */
  number: string
  /** 괄호 안 제목 — 없으면 빈 문자열 */
  title: string
  /** 소속 장 제목 (없으면 null) */
  chapter: string | null
}

export interface ChapterRef {
  title: string
  articles: ArticleRef[]
}

export interface ArticleBlock extends ArticleRef {
  /** 조 제목 <p> 를 포함한, 다음 조/장 직전까지의 HTML */
  html: string
  /** 태그 제거·공백 정리한 비교용 텍스트 */
  text: string
}

const CHAPTER_RE = /<h2[^>]*>([\s\S]*?)<\/h2>/i
/**
 * 조 제목 한 줄: <p><strong>제N조 (제목)</strong></p>
 * 제목 괄호는 탐욕(.*)으로 잡는다 — "제12조 (쿠키(Cookie)의 운영)" 처럼 괄호가 겹치는 제목이 있다.
 */
const ARTICLE_RE = /^<p[^>]*>\s*<strong>\s*(제\s*\d+\s*조(?:\s*의\s*\d+)?)\s*(?:\((.*)\))?\s*<\/strong>\s*<\/p>$/i
/** 최상위 블록 하나(h1~6, p, table, ul, ol, hr, blockquote). 사용할 때마다 lastIndex 가 섞이지 않도록 새로 만든다. */
const blockRegex = () => /<(h[1-6]|p|table|ul|ol|hr|blockquote)\b[^>]*>[\s\S]*?<\/\1>|<hr\b[^>]*\/?>/gi

/** html 을 블록 단위(최상위 태그 하나씩)로 쪼갠다. 중첩 테이블은 하나의 블록으로 유지. */
export function splitBlocks(html: string): string[] {
  return Array.from(html.matchAll(blockRegex()), (m) => m[0].trim())
}

export function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function articleId(number: string): string {
  // "제3조의2" → "art-3-2", "제12조" → "art-12"
  const nums = number.replace(/\s+/g, '').match(/\d+/g) ?? []
  return `art-${nums.join('-')}`
}

/** 본문을 조 단위 블록으로 나눈다. 조 앞에 오는 서문은 버린다(목차 대상 아님). */
export function parseArticles(html: string): ArticleBlock[] {
  const blocks = splitBlocks(html)
  const articles: ArticleBlock[] = []
  let chapter: string | null = null
  let current: ArticleBlock | null = null

  for (const block of blocks) {
    const ch = block.match(CHAPTER_RE)
    if (ch) {
      chapter = stripTags(ch[1])
      current = null
      continue
    }
    const art = block.match(ARTICLE_RE)
    if (art) {
      const number = art[1].replace(/\s+/g, '')
      current = {
        id: articleId(number),
        number,
        title: (art[2] ?? '').trim(),
        chapter,
        html: block,
        text: '',
      }
      articles.push(current)
      continue
    }
    if (current) current.html += block
  }

  return articles.map((a) => ({ ...a, text: stripTags(a.html) }))
}

/** 목차: 장 → 조. 장이 없으면 title null 인 장 하나. */
export function buildToc(html: string): ChapterRef[] {
  const toc: ChapterRef[] = []
  for (const a of parseArticles(html)) {
    const key = a.chapter ?? ''
    const last = toc[toc.length - 1]
    if (!last || last.title !== key) toc.push({ title: key, articles: [] })
    toc[toc.length - 1].articles.push({ id: a.id, number: a.number, title: a.title, chapter: a.chapter })
  }
  return toc
}

export function formatKoreanDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${y}년 ${m}월 ${d}일`
}

/**
 * 열람용 렌더: 조 제목 <p> 에 앵커 id 부여 + {{시행일}} 치환.
 * 편집기 저장본(원문)은 건드리지 않고 표시할 때만 쓴다.
 */
export function renderRegulationHtml(html: string, effectiveDate: string | null | undefined): string {
  const dateText = formatKoreanDate(effectiveDate) || '(시행일 미정)'
  // 블록을 제자리에서 바꾼다. 예전에는 조 전체 html 을 문자열 치환했는데, 블록 사이 줄바꿈이나
  // 깨진 <p><table> 구조가 있으면 원문과 일치하지 않아 앵커가 통째로 빠졌다 (2026-11-23).
  const withAnchors = html.replace(blockRegex(), (block) => {
    const art = block.match(ARTICLE_RE)
    const head = block.match(/^<p([^>]*)>/i)
    if (!art || !head || /\sid=/i.test(head[1])) return block
    const id = articleId(art[1].replace(/\s+/g, ''))
    return `<p id="${id}"${head[1]}>${block.slice(head[0].length)}`
  })
  return withAnchors.replace(/\{\{\s*시행일\s*\}\}/g, dateText)
}

export type ArticleChangeKind = 'added' | 'removed' | 'changed'

export interface ArticleChange {
  kind: ArticleChangeKind
  id: string
  number: string
  before: ArticleBlock | null
  after: ArticleBlock | null
}

/** 신구조문 대비: 조 번호 기준으로 추가·삭제·변경을 찾는다. 변경 없음은 제외. */
export function diffArticles(beforeHtml: string, afterHtml: string): ArticleChange[] {
  const before = new Map(parseArticles(beforeHtml).map((a) => [a.id, a]))
  const after = new Map(parseArticles(afterHtml).map((a) => [a.id, a]))
  const changes: ArticleChange[] = []

  for (const [id, b] of before) {
    const a = after.get(id)
    if (!a) {
      changes.push({ kind: 'removed', id, number: b.number, before: b, after: null })
    } else if (a.text !== b.text) {
      changes.push({ kind: 'changed', id, number: b.number, before: b, after: a })
    }
  }
  for (const [id, a] of after) {
    if (!before.has(id)) changes.push({ kind: 'added', id, number: a.number, before: null, after: a })
  }

  return changes.sort((x, y) => compareArticleId(x.id, y.id))
}

function compareArticleId(a: string, b: string): number {
  const na = a.split('-').slice(1).map(Number)
  const nb = b.split('-').slice(1).map(Number)
  for (let i = 0; i < Math.max(na.length, nb.length); i++) {
    const d = (na[i] ?? 0) - (nb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/** 조 번호 연속성 점검 — 발행 전 경고용. 빠진 번호·중복 번호를 돌려준다. */
export function validateArticleNumbers(html: string): { missing: number[]; duplicated: string[] } {
  const articles = parseArticles(html)
  const seen = new Map<string, number>()
  const mains = new Set<number>()
  for (const a of articles) {
    seen.set(a.id, (seen.get(a.id) ?? 0) + 1)
    const main = Number(a.id.split('-')[1])
    if (!Number.isNaN(main)) mains.add(main)
  }
  const duplicated = Array.from(seen.entries()).filter(([, n]) => n > 1).map(([id]) => id)
  const max = Math.max(0, ...mains)
  const missing: number[] = []
  for (let i = 1; i <= max; i++) if (!mains.has(i)) missing.push(i)
  return { missing, duplicated }
}
