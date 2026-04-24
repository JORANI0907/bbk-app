/**
 * BBK Ops Hub — Notion 콘텐츠 조회 라이브러리
 * 노션 → 앱 방향 (읽기 전용)
 */

const NOTION_API_BASE = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

// ─── DB ID 상수 ───────────────────────────────────────────────

export const NOTION_DBS = {
  상품모델: '6fd001c5-939e-4539-a823-f423f1a47194',
  시공사례: 'b02d186e-5f26-4c5c-8106-efba3715f0ca',
  이벤트혜택: 'b1fae8a3-7080-4743-b7f5-3319fce72efc',
  청소꿀팁: 'd28ac008-f1f0-4a49-92a6-b4836ca7120c',
  대표일상: '1998b057-c4bd-45e8-9c41-96daee784881',
  회사규정: 'd31e2456-15b9-4d5f-9128-8bec2fc0a8ac',
  관내활동: 'dee6aa43-6a70-420d-b7b6-0d195c788a1c',
  서비스범위및안내: '0993151f-f22b-4158-8dc4-a4c7fdc8934f',
} as const

export type NotionDbKey = keyof typeof NOTION_DBS

// ─── 타입 ─────────────────────────────────────────────────────

export interface NotionPage {
  id: string
  url: string
  createdAt: string
  title: string
  props: Record<string, NotionPropValue>
}

export type NotionPropValue =
  | string
  | number
  | string[]
  | null

// ─── 헬퍼 ─────────────────────────────────────────────────────

function getHeaders(): Record<string, string> {
  const apiKey = process.env.NOTION_API_KEY
  if (!apiKey) throw new Error('NOTION_API_KEY 환경변수가 없습니다.')
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Notion-Version': NOTION_VERSION,
  }
}

/**
 * Notion 속성 값을 단순 타입으로 변환
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractProp(prop: any): NotionPropValue {
  if (!prop) return null
  switch (prop.type) {
    case 'title':
      return prop.title?.map((t: { plain_text: string }) => t.plain_text).join('') ?? ''
    case 'rich_text':
      return prop.rich_text?.map((t: { plain_text: string }) => t.plain_text).join('') ?? ''
    case 'select':
      return prop.select?.name ?? null
    case 'multi_select':
      return prop.multi_select?.map((s: { name: string }) => s.name) ?? []
    case 'number':
      return prop.number ?? null
    case 'url':
      return prop.url ?? null
    case 'date':
      return prop.date?.start ?? null
    case 'checkbox':
      return prop.checkbox ? '✅' : '❌'
    case 'relation':
      return prop.relation?.length > 0 ? `${prop.relation.length}개 연결됨` : null
    default:
      return null
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseNotionPage(raw: any, titleField: string): NotionPage {
  const props: Record<string, NotionPropValue> = {}
  for (const [key, val] of Object.entries(raw.properties ?? {})) {
    props[key] = extractProp(val)
  }
  const title = (props[titleField] as string) ?? '(제목 없음)'
  return {
    id: raw.id,
    url: raw.url,
    createdAt: raw.created_time,
    title,
    props,
  }
}

// ─── 핵심 쿼리 함수 ───────────────────────────────────────────

export interface QueryOptions {
  pageSize?: number
  startCursor?: string
  /** visibility 필터 (기본값: 모든 항목 표시 — 관리자용) */
  visibilityFilter?: string
}

export interface QueryResult {
  items: NotionPage[]
  hasMore: boolean
  nextCursor: string | null
}

/**
 * 노션 DB 전체 조회 (관리자용 — visibility 필터 없음)
 * Next.js fetch 캐싱: 30초 revalidate
 */
export async function queryNotionDb(
  dbId: string,
  titleField: string,
  options: QueryOptions = {},
): Promise<QueryResult> {
  const { pageSize = 50, startCursor, visibilityFilter } = options

  const body: Record<string, unknown> = {
    page_size: pageSize,
    sorts: [{ timestamp: 'created_time', direction: 'descending' }],
  }
  if (startCursor) body.start_cursor = startCursor
  if (visibilityFilter) {
    body.filter = {
      property: 'visibility',
      select: { equals: visibilityFilter },
    }
  }

  const res = await fetch(`${NOTION_API_BASE}/databases/${dbId}/query`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
    next: { revalidate: 30 },
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Notion API 오류 (${res.status}): ${err}`)
  }

  const data = await res.json()
  return {
    items: data.results.map((r: unknown) => parseNotionPage(r, titleField)),
    hasMore: data.has_more,
    nextCursor: data.next_cursor ?? null,
  }
}

// ─── DB별 편의 함수 ───────────────────────────────────────────

export const notionContent = {
  상품모델: (opts?: QueryOptions) =>
    queryNotionDb(NOTION_DBS.상품모델, '상품명', opts),
  시공사례: (opts?: QueryOptions) =>
    queryNotionDb(NOTION_DBS.시공사례, '제목', opts),
  이벤트혜택: (opts?: QueryOptions) =>
    queryNotionDb(NOTION_DBS.이벤트혜택, '이벤트명', opts),
  청소꿀팁: (opts?: QueryOptions) =>
    queryNotionDb(NOTION_DBS.청소꿀팁, '제목', opts),
  대표일상: (opts?: QueryOptions) =>
    queryNotionDb(NOTION_DBS.대표일상, '제목', opts),
  회사규정: (opts?: QueryOptions) =>
    queryNotionDb(NOTION_DBS.회사규정, '규정명', opts),
  관내활동: (opts?: QueryOptions) =>
    queryNotionDb(NOTION_DBS.관내활동, '제목', opts),
  서비스범위및안내: (opts?: QueryOptions) =>
    queryNotionDb(NOTION_DBS.서비스범위및안내, '품목명', opts),
}
