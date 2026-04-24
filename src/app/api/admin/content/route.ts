import { NextRequest, NextResponse } from 'next/server'
import { NOTION_DBS, queryNotionDb, NotionDbKey } from '@/lib/notion-content'
import { getServerSession } from '@/lib/session'

// DB 키와 타이틀 필드 매핑
const DB_TITLE_FIELDS: Record<string, string> = {
  상품모델: '상품명',
  시공사례: '제목',
  이벤트혜택: '이벤트명',
  청소꿀팁: '제목',
  대표일상: '제목',
  회사규정: '규정명',
  관내활동: '제목',
  서비스범위및안내: '품목명',
}

export async function GET(req: NextRequest) {
  const session = getServerSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const db = searchParams.get('db') as NotionDbKey | null
  const cursor = searchParams.get('cursor') ?? undefined
  const visibility = searchParams.get('visibility') ?? undefined

  if (!db || !(db in NOTION_DBS)) {
    return NextResponse.json({ error: `유효하지 않은 DB: ${db}` }, { status: 400 })
  }

  try {
    const titleField = DB_TITLE_FIELDS[db]
    const result = await queryNotionDb(NOTION_DBS[db as NotionDbKey], titleField, {
      pageSize: 50,
      startCursor: cursor,
      visibilityFilter: visibility,
    })
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
