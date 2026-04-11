import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'
import { verifySession } from '@/lib/session'

export async function GET(request: NextRequest) {
  const cookieStore = cookies()
  const token = cookieStore.get('bbk_session')?.value
  const session = token ? verifySession(token) : null

  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const workerId = searchParams.get('worker_id')
  const month = searchParams.get('month') // YYYY-MM
  const type = searchParams.get('type') // all | use | return

  const supabase = createServiceClient()

  let query = supabase
    .from('inventory_logs')
    .select(`
      id,
      inventory_id,
      worker_id,
      change_type,
      quantity,
      note,
      created_at,
      worker_name
    `)
    .order('created_at', { ascending: false })

  if (workerId) {
    query = query.eq('worker_id', workerId)
  }

  if (month) {
    const from = `${month}-01`
    const [year, mon] = month.split('-').map(Number)
    const nextMonth = mon === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(mon + 1).padStart(2, '0')}-01`
    query = query.gte('created_at', from).lt('created_at', nextMonth)
  }

  if (type && type !== 'all') {
    const txMap: Record<string, string> = { 'use': 'use', 'return': 'return' }
    if (txMap[type]) {
      query = query.eq('change_type', txMap[type])
    }
  } else if (!type || type === 'all') {
    // 수령(use) 및 반납(return)만 집계 대상
    query = query.in('change_type', ['use', 'return'])
  }

  const { data, error } = await query.limit(500)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // inventory_id -> item_name 매핑
  const inventoryIds = Array.from(new Set((data ?? []).map(l => l.inventory_id).filter(Boolean)))
  let itemMap: Record<string, string> = {}

  if (inventoryIds.length > 0) {
    const { data: items } = await supabase
      .from('inventory_items')
      .select('id, item_name')
      .in('id', inventoryIds)
    itemMap = Object.fromEntries((items ?? []).map(i => [i.id, i.item_name]))
  }

  const logs = (data ?? []).map(l => ({
    ...l,
    item_name: itemMap[l.inventory_id] ?? '알 수 없음',
  }))

  return NextResponse.json({ logs })
}
