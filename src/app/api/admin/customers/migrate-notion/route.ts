import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const NOTION_API_BASE = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

// ─── 이관 대상 DB ─────────────────────────────────────────────
const DB_A_ID = '254fc2d5-65d7-803b-85a8-000b43db43e7'
const DB_B_ID = '260fc2d5-65d7-81c2-a2d0-000bcd06c419'
const DB_C_ID = '2b1fc2d5-65d7-8034-b8de-000b7e0583be'

// DB A: 1회성케어 제외 목록 (이 상호명들은 정기 고객 → 스킵)
const DB_A_REGULAR_NAMES = ['태수', '명가통닭', '북촌손만두 제주명가', '신전떡볶이 성신여대점']

// ─── 타입 ─────────────────────────────────────────────────────
interface NotionProp {
  type: string
  title?: Array<{ plain_text: string }>
  rich_text?: Array<{ plain_text: string }>
  select?: { name: string } | null
  multi_select?: Array<{ name: string }>
  checkbox?: boolean
  phone_number?: string
  email?: string
  number?: number | null
}

interface NotionPageRaw {
  id: string
  properties: Record<string, NotionProp>
}

interface CustomerInsert {
  business_name: string
  contact_name: string | null
  contact_phone: string | null
  address: string | null
  address_detail: string | null
  care_scope: string | null
  payment_method: string | null
  elevator: string | null
  access_method: string | null
  building_access: string | null
  parking_info: string | null
  door_password: string | null
  business_hours_start: string | null
  business_hours_end: string | null
  business_number: string | null
  email: string | null
  account_number: string | null
  platform_nickname: string | null
  deposit: number | null
  supply_amount: number | null
  special_notes: string | null
  notes: string | null
  customer_type: '1회성케어'
  status: 'active'
}

// ─── 헬퍼 ─────────────────────────────────────────────────────
function getNotionHeaders(): Record<string, string> {
  const apiKey = process.env.NOTION_API_KEY
  if (!apiKey) throw new Error('NOTION_API_KEY 환경변수가 없습니다.')
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Notion-Version': NOTION_VERSION,
  }
}

function extractText(prop: NotionProp | undefined): string {
  if (!prop) return ''
  if (prop.type === 'title') return prop.title?.map(t => t.plain_text).join('') ?? ''
  if (prop.type === 'rich_text') return prop.rich_text?.map(t => t.plain_text).join('') ?? ''
  if (prop.type === 'phone_number') return prop.phone_number ?? ''
  if (prop.type === 'email') return prop.email ?? ''
  if (prop.type === 'select') return prop.select?.name ?? ''
  if (prop.type === 'multi_select') return prop.multi_select?.map(s => s.name).join(', ') ?? ''
  return ''
}

function extractNumber(prop: NotionProp | undefined): number | null {
  if (!prop || prop.type !== 'number') return null
  return prop.number ?? null
}

function orNull(val: string): string | null {
  const trimmed = val.trim()
  return trimmed === '' ? null : trimmed
}

// Notion DB 전체 페이지 수집 (페이지네이션 처리)
async function fetchAllNotionPages(
  dbId: string,
  filter?: Record<string, unknown>,
): Promise<NotionPageRaw[]> {
  const results: NotionPageRaw[] = []
  let cursor: string | undefined = undefined
  let hasMore = true

  while (hasMore) {
    const body: Record<string, unknown> = { page_size: 100 }
    if (cursor) body.start_cursor = cursor
    if (filter) body.filter = filter

    const res = await fetch(`${NOTION_API_BASE}/databases/${dbId}/query`, {
      method: 'POST',
      headers: getNotionHeaders(),
      body: JSON.stringify(body),
      cache: 'no-store',
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Notion API 오류 (${res.status}): ${err}`)
    }

    const data = await res.json() as { results: NotionPageRaw[]; has_more: boolean; next_cursor: string | null }
    results.push(...data.results)
    hasMore = data.has_more
    cursor = data.next_cursor ?? undefined
  }

  return results
}

// ─── DB A 파싱 ────────────────────────────────────────────────
// 필드: 상호명, 성함, 연락처, 주소, 범위, 결제방법, 엘레베이터, 출입방법, 주차방법, 비밀번호, 오픈시간, 마감시간, 고객→회사 전달사항
function parseDbA(page: NotionPageRaw): CustomerInsert | null {
  const p = page.properties
  const businessName = orNull(extractText(p['상호명']))
  if (!businessName) return null
  if (DB_A_REGULAR_NAMES.includes(businessName)) return null

  return {
    business_name: businessName,
    contact_name: orNull(extractText(p['성함'])),
    contact_phone: orNull(extractText(p['연락처'])),
    address: orNull(extractText(p['주소'])),
    address_detail: null,
    care_scope: orNull(extractText(p['범위'])),
    payment_method: orNull(extractText(p['결제방법'])),
    elevator: orNull(extractText(p['엘레베이터'])),
    access_method: orNull(extractText(p['출입방법'])),
    building_access: null,
    parking_info: orNull(extractText(p['주차방법'])),
    door_password: orNull(extractText(p['비밀번호'])),
    business_hours_start: orNull(extractText(p['오픈시간'])),
    business_hours_end: orNull(extractText(p['마감시간'])),
    business_number: null,
    email: null,
    account_number: null,
    platform_nickname: null,
    deposit: null,
    supply_amount: null,
    special_notes: orNull(extractText(p['고객 → 회사 전달사항'])),
    notes: null,
    customer_type: '1회성케어',
    status: 'active',
  }
}

// ─── DB B 파싱 ────────────────────────────────────────────────
// 필드: 상호명, 성함, 연락처, 주소, 위치(address_detail), 범위, 결제방법, 엘레베이터, 출입방법,
//       주차방법, 비밀번호, 오픈시간, 마감시간, 사업자번호, 이메일 주소, 비고, 고객→회사 전달사항
function parseDbB(page: NotionPageRaw): CustomerInsert | null {
  const p = page.properties
  const businessName = orNull(extractText(p['상호명']))
  if (!businessName) return null

  return {
    business_name: businessName,
    contact_name: orNull(extractText(p['성함'])),
    contact_phone: orNull(extractText(p['연락처'])),
    address: orNull(extractText(p['주소'])),
    address_detail: orNull(extractText(p['위치'])),
    care_scope: orNull(extractText(p['범위'])),
    payment_method: orNull(extractText(p['결제방법'])),
    elevator: orNull(extractText(p['엘레베이터'])),
    access_method: orNull(extractText(p['출입방법'])),
    building_access: null,
    parking_info: orNull(extractText(p['주차방법'])),
    door_password: orNull(extractText(p['비밀번호'])),
    business_hours_start: orNull(extractText(p['오픈시간'])),
    business_hours_end: orNull(extractText(p['마감시간'])),
    business_number: orNull(extractText(p['사업자번호'])),
    email: orNull(extractText(p['이메일 주소'])),
    account_number: null,
    platform_nickname: null,
    deposit: null,
    supply_amount: null,
    special_notes: orNull(extractText(p['고객 → 회사 전달사항'])),
    notes: orNull(extractText(p['비고'])),
    customer_type: '1회성케어',
    status: 'active',
  }
}

// ─── DB C 파싱 ────────────────────────────────────────────────
// 필드: 상호명, 고객명, 연락처, 주소, 위치(address_detail), 케어범위, 결제방법, 엘레베이터,
//       출입방법, 출입신청(building_access), 주차방법, 오픈시간, 마감시간, 사업자번호, 이메일주소,
//       계좌번호, 닉네임, 예약금(deposit), 공급가액(supply_amount), 유의사항
function parseDbC(page: NotionPageRaw): CustomerInsert | null {
  const p = page.properties
  const businessName = orNull(extractText(p['상호명']))
  if (!businessName) return null

  return {
    business_name: businessName,
    contact_name: orNull(extractText(p['고객명'])),
    contact_phone: orNull(extractText(p['연락처'])),
    address: orNull(extractText(p['주소'])),
    address_detail: orNull(extractText(p['위치'])),
    care_scope: orNull(extractText(p['케어범위'])),
    payment_method: orNull(extractText(p['결제방법'])),
    elevator: orNull(extractText(p['엘레베이터'])),
    access_method: orNull(extractText(p['출입방법'])),
    building_access: orNull(extractText(p['출입신청'])),
    parking_info: orNull(extractText(p['주차방법'])),
    door_password: null,
    business_hours_start: orNull(extractText(p['오픈시간'])),
    business_hours_end: orNull(extractText(p['마감시간'])),
    business_number: orNull(extractText(p['사업자번호'])),
    email: orNull(extractText(p['이메일주소'])),
    account_number: orNull(extractText(p['계좌번호'])),
    platform_nickname: orNull(extractText(p['닉네임'])),
    deposit: extractNumber(p['예약금']),
    supply_amount: extractNumber(p[' 공급가액 ']),
    special_notes: null,
    notes: orNull(extractText(p['유의사항'])),
    customer_type: '1회성케어',
    status: 'active',
  }
}

// ─── 단일 레코드 upsert ──────────────────────────────────────
interface UpsertResult {
  inserted: number
  skipped: number
  errors: string[]
}

async function upsertCustomers(
  supabase: ReturnType<typeof createServiceClient>,
  records: CustomerInsert[],
  result: UpsertResult,
): Promise<void> {
  for (const record of records) {
    try {
      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .eq('business_name', record.business_name)
        .is('deleted_at', null)
        .maybeSingle()

      if (existing) {
        result.skipped++
        continue
      }

      const { error } = await supabase
        .from('customers')
        .insert(record)

      if (error) {
        result.errors.push(`[${record.business_name}] ${error.message}`)
      } else {
        result.inserted++
      }
    } catch (e) {
      result.errors.push(`[${record.business_name}] ${e instanceof Error ? e.message : '알 수 없는 오류'}`)
    }
  }
}

// ─── POST 핸들러 ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && secret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const result: UpsertResult = { inserted: 0, skipped: 0, errors: [] }

  try {
    // ── DB A ──────────────────────────────────────────────────
    const pagesA = await fetchAllNotionPages(DB_A_ID)
    const recordsA = pagesA
      .map(p => parseDbA(p))
      .filter((r): r is CustomerInsert => r !== null)
    await upsertCustomers(supabase, recordsA, result)

    // ── DB B: 정기청소 = false 필터 ───────────────────────────
    const pagesB = await fetchAllNotionPages(DB_B_ID, {
      property: '정기청소',
      checkbox: { equals: false },
    })
    const recordsB = pagesB
      .map(p => parseDbB(p))
      .filter((r): r is CustomerInsert => r !== null)
    await upsertCustomers(supabase, recordsB, result)

    // ── DB C: 케어유형 = '1회성케어' 필터 ────────────────────
    const pagesC = await fetchAllNotionPages(DB_C_ID, {
      property: '케어유형',
      select: { equals: '1회성케어' },
    })
    const recordsC = pagesC
      .map(p => parseDbC(p))
      .filter((r): r is CustomerInsert => r !== null)
    await upsertCustomers(supabase, recordsC, result)

  } catch (e) {
    const message = e instanceof Error ? e.message : '알 수 없는 오류'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json(result)
}
