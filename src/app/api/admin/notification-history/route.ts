import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const PAGE_SIZE = 50

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const page = Math.max(0, parseInt(searchParams.get('page') ?? '0', 10))
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    // 고객관리 발송이력 툴팁: 특정 고객의 최근 알림 이력 lazy fetch 용.
    // metadata.customer_id 로 필터 → 크론·수동 발송 모두 동일 metadata 규약을 따르므로 통합 조회.
    const customerId = searchParams.get('customer_id')
    const type = searchParams.get('type')
    const limitParam = parseInt(searchParams.get('limit') ?? '', 10)
    const limit = Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, 200)
      : PAGE_SIZE

    const supabase = createServiceClient()

    let query = supabase
      .from('notification_history')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1)

    if (category && category !== 'all') {
      query = query.eq('category', category)
    }

    if (from) {
      query = query.gte('created_at', `${from}T00:00:00+09:00`)
    }

    if (to) {
      query = query.lte('created_at', `${to}T23:59:59+09:00`)
    }

    if (customerId) {
      query = query.eq('metadata->>customer_id', customerId)
    }

    if (type) {
      query = query.eq('type', type)
    }

    const { data, error, count } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      data: data ?? [],
      total: count ?? 0,
      page,
      pageSize: limit,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
