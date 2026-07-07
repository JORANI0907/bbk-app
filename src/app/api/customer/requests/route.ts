import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase/server'
import { getPortalCustomers } from '@/lib/customer-portal'

export const dynamic = 'force-dynamic'


export async function GET() {
  const session = getServerSession()
  if (!session || session.role !== 'customer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { ids: customerIds } = await getPortalCustomers(supabase, session.userId)
  if (customerIds.length === 0) return NextResponse.json({ requests: [] })

  const { data, error } = await supabase
    .from('customer_requests')
    .select('*')
    .in('customer_id', customerIds)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ requests: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = getServerSession()
  if (!session || session.role !== 'customer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { content } = await req.json()
  if (!content?.trim()) {
    return NextResponse.json({ error: '내용을 입력해주세요.' }, { status: 400 })
  }

  // 새 요청은 메인 계정 customer(primary) 에만 붙임. 서브 계약 요청 분리 UI는 추후 검토.
  const supabase = createServiceClient()
  const { primary } = await getPortalCustomers(supabase, session.userId)
  if (!primary) {
    return NextResponse.json({ error: '고객 정보를 찾을 수 없습니다.' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('customer_requests')
    .insert({ customer_id: primary.id, user_id: session.userId, content: content.trim() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ request: data }, { status: 201 })
}
