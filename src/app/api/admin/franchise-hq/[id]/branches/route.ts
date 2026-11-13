import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

// GET: 지점(customer) 후보 검색 — 서버사이드 ilike 검색.
// 기존에는 페이지에서 customers 를 limit(500) 로 받아 클라이언트에서 필터링했는데,
// 1회성케어 등으로 고객이 500건을 넘으면 가나다순 뒤쪽 업체(예: "큰손닭강정")가
// 잘려 검색되지 않는 문제가 있었다. 전체 고객을 대상으로 서버에서 직접 검색한다.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = getServerSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  try {
    const q = (request.nextUrl.searchParams.get('q') ?? '').trim()
    const supabase = createServiceClient()

    // 이미 매핑된 지점은 후보에서 제외
    const { data: mappings } = await supabase
      .from('franchise_branch_map')
      .select('customer_id')
      .eq('franchise_hq_id', params.id)
    const mappedIds = (mappings ?? []).map((m) => m.customer_id)

    let query = supabase
      .from('customers')
      .select('id, business_name, address')
      .is('deleted_at', null)
      .order('business_name', { ascending: true })
      .limit(30)

    if (q) {
      // PostgREST or() 필터 문법을 깨뜨리는 문자(% ( ) ,)는 공백으로 치환
      const esc = q.replace(/[%(),]/g, ' ')
      query = query.or(`business_name.ilike.%${esc}%,address.ilike.%${esc}%`)
    }
    if (mappedIds.length) {
      query = query.not('id', 'in', `(${mappedIds.join(',')})`)
    }

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ candidates: data ?? [] })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// POST: 지점(customer) 매핑 추가 (배열 또는 단일)
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = getServerSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  try {
    const { customerIds } = (await request.json()) as { customerIds: string[] }
    if (!Array.isArray(customerIds) || customerIds.length === 0) {
      return NextResponse.json({ error: '지점을 1개 이상 선택해주세요.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: hq } = await supabase
      .from('franchise_hq')
      .select('id')
      .eq('id', params.id)
      .single()
    if (!hq) {
      return NextResponse.json({ error: '본사를 찾을 수 없습니다.' }, { status: 404 })
    }

    // 기존 매핑 개수 (display_order 시작점 결정)
    const { count } = await supabase
      .from('franchise_branch_map')
      .select('*', { count: 'exact', head: true })
      .eq('franchise_hq_id', params.id)

    const baseOrder = count ?? 0
    const rows = customerIds.map((cid, i) => ({
      franchise_hq_id: params.id,
      customer_id: cid,
      display_order: baseOrder + i,
    }))

    const { error } = await supabase
      .from('franchise_branch_map')
      .upsert(rows, { onConflict: 'franchise_hq_id,customer_id' })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, added: rows.length })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// DELETE: 지점 매핑 제거 (?customerId=...)
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = getServerSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  try {
    const customerId = request.nextUrl.searchParams.get('customerId')
    if (!customerId) {
      return NextResponse.json({ error: '지점 ID가 필요합니다.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { error } = await supabase
      .from('franchise_branch_map')
      .delete()
      .eq('franchise_hq_id', params.id)
      .eq('customer_id', customerId)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
