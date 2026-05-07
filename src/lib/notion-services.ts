const NOTION_API_BASE = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'
const SERVICE_DB_ID = 'fc5b6c14-073e-4973-8e6f-a5c0eb07f976'

type RichTextItem = { plain_text: string }

type NotionPageProperties = {
  품목명: { title: RichTextItem[] }
  slug: { rich_text: RichTextItem[] }
  카테고리: { select: { name: string } | null }
  visibility: { select: { name: string } | null }
  본문요약: { rich_text: RichTextItem[] }
  tags: { multi_select: { name: string }[] }
}

type NotionPage = {
  id: string
  url: string
  properties: NotionPageProperties
}

type NotionBlock = {
  type: string
  paragraph?: { rich_text: RichTextItem[] }
  heading_1?: { rich_text: RichTextItem[] }
  heading_2?: { rich_text: RichTextItem[] }
  heading_3?: { rich_text: RichTextItem[] }
  bulleted_list_item?: { rich_text: RichTextItem[] }
  numbered_list_item?: { rich_text: RichTextItem[] }
}

export type ServiceItem = {
  id: string
  notionUrl: string
  name: string
  slug: string
  category: string | null
  summary: string | null
  tags: string[]
}

export type ServiceBlock = {
  type: string
  text: string
}

export const CATEGORY_CONFIG: Record<string, { icon: string; label: string; order: number }> = {
  주방기기: { icon: '🔥', label: '주방기기', order: 1 },
  공간: { icon: '🏪', label: '공간 청소', order: 2 },
  위생설비: { icon: '🚿', label: '위생설비', order: 3 },
  설비: { icon: '❄️', label: '설비', order: 4 },
  기타: { icon: '📋', label: '기타', order: 5 },
}

function getHeaders(): Record<string, string> {
  const apiKey = process.env.NOTION_API_KEY
  if (!apiKey) throw new Error('NOTION_API_KEY 환경변수가 설정되지 않았습니다.')
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Notion-Version': NOTION_VERSION,
  }
}

function makeSlug(name: string): string {
  return name.trim().replace(/\s+/g, '-')
}

function extractText(richText: RichTextItem[]): string {
  return richText.map((t) => t.plain_text).join('')
}

export async function fetchServiceItems(): Promise<ServiceItem[]> {
  const res = await fetch(`${NOTION_API_BASE}/databases/${SERVICE_DB_ID}/query`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      filter: {
        property: 'visibility',
        select: { equals: 'public_app' },
      },
      sorts: [{ property: '카테고리', direction: 'ascending' }],
    }),
    next: { revalidate: 30 },
  })

  if (!res.ok) return []

  const data = (await res.json()) as { results: NotionPage[] }

  return data.results.map((page) => {
    const props = page.properties
    const name = extractText(props.품목명.title)
    const slugRaw = extractText(props.slug.rich_text)

    return {
      id: page.id,
      notionUrl: page.url,
      name,
      slug: slugRaw || makeSlug(name),
      category: props.카테고리.select?.name ?? null,
      summary: extractText(props.본문요약.rich_text) || null,
      tags: props.tags.multi_select.map((t) => t.name),
    }
  })
}

export async function fetchServiceItemBySlug(slug: string): Promise<ServiceItem | null> {
  const items = await fetchServiceItems()
  return items.find((item) => item.slug === slug) ?? null
}

export async function fetchServiceBlocks(pageId: string): Promise<ServiceBlock[]> {
  const res = await fetch(`${NOTION_API_BASE}/blocks/${pageId}/children`, {
    headers: getHeaders(),
    next: { revalidate: 30 },
  })

  if (!res.ok) return []

  const data = (await res.json()) as { results: NotionBlock[] }

  return data.results
    .map((block): ServiceBlock | null => {
      const type = block.type
      const richText =
        block.paragraph?.rich_text ??
        block.heading_1?.rich_text ??
        block.heading_2?.rich_text ??
        block.heading_3?.rich_text ??
        block.bulleted_list_item?.rich_text ??
        block.numbered_list_item?.rich_text ??
        null

      if (!richText) return null
      const text = extractText(richText).trim()
      if (!text) return null
      return { type, text }
    })
    .filter((b): b is ServiceBlock => b !== null)
}

export function groupByCategory(items: ServiceItem[]): Map<string, ServiceItem[]> {
  const map = new Map<string, ServiceItem[]>()
  const sortedCategories = Object.entries(CATEGORY_CONFIG)
    .sort((a, b) => a[1].order - b[1].order)
    .map(([key]) => key)

  for (const cat of sortedCategories) {
    const group = items.filter((i) => i.category === cat)
    if (group.length > 0) map.set(cat, group)
  }

  const uncategorized = items.filter((i) => !i.category || !CATEGORY_CONFIG[i.category])
  if (uncategorized.length > 0) map.set('기타', uncategorized)

  return map
}
