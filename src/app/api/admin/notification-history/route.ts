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

    const supabase = createServiceClient()

    let query = supabase
      .from('notification_history')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (category && category !== 'all') {
      query = query.eq('category', category)
    }

    if (from) {
      query = query.gte('created_at', `${from}T00:00:00+09:00`)
    }

    if (to) {
      query = query.lte('created_at', `${to}T23:59:59+09:00`)
    }

    const { data, error, count } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      data: data ?? [],
      total: count ?? 0,
      page,
      pageSize: PAGE_SIZE,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
