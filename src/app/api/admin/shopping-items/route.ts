import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSlack } from '@/lib/slack'

interface ShoppingItemInput {
  title: string
  category: string
  priority: 'urgent' | 'normal' | 'later'
  qty: number
  expected_price?: number
  where_to_buy?: string
  url?: string
  memo?: string
}

interface RequestBody {
  applicationId: string
  businessName: string
  serviceType: string | null
  items: ShoppingItemInput[]
}

interface ShoppingItemRow {
  title: string
  category: string
  priority: 'urgent' | 'normal' | 'later'
  qty: number
  expected_price: number | null
  where_to_buy: string | null
  url: string | null
  memo: string | null
  status: string
  sort_order: number
}

export async function POST(request: NextRequest) {
  const supabase = createServiceClient()

  let body: RequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 바디를 파싱할 수 없습니다.' }, { status: 400 })
  }

  const { applicationId, businessName, serviceType, items } = body

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items는 비어있지 않은 배열이어야 합니다.' }, { status: 400 })
  }

  // title이 빈 항목 필터링
  const validItems = items.filter(
    (item) => typeof item.title === 'string' && item.title.trim() !== ''
  )

  // 유효한 항목이 하나도 없으면 400
  if (validItems.length === 0) {
    return NextResponse.json({ error: '유효한 title이 있는 항목이 없습니다.' }, { status: 400 })
  }

  // 현재 최대 sort_order 조회
  const { data: maxData } = await supabase
    .from('shopping_items')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .single()

  const baseOrder: number = (maxData as { sort_order: number } | null)?.sort_order ?? -1

  // INSERT 데이터 준비
  const rows: ShoppingItemRow[] = validItems.map((item, index) => ({
    title: item.title.trim(),
    category: item.category || '기타',
    priority: item.priority || 'normal',
    qty: item.qty || 1,
    expected_price: item.expected_price ?? null,
    where_to_buy: item.where_to_buy?.trim() || null,
    url: item.url?.trim() || null,
    memo:
      item.memo?.trim() ||
      `[BBK 서비스 연동] 업체명: ${businessName} / 서비스: ${serviceType ?? '미지정'} / 신청서ID: ${applicationId}`,
    status: 'pending',
    sort_order: baseOrder + index + 1,
  }))

  const { data, error } = await supabase
    .from('shopping_items')
    .insert(rows)
    .select()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Slack 알림 (fire-and-forget)
  sendSlack(
    `🛒 필요한 물건 ${rows.length}개 추가 - ${businessName}`
  ).catch(() => {})

  return NextResponse.json(
    { success: true, inserted: rows.length, items: data },
    { status: 201 }
  )
}
