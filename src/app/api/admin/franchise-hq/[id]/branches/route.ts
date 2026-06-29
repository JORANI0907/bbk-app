import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

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
