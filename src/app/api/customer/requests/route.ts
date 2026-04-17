import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase/server'

async function getCustomerId(userId: string) {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .single()
  return data?.id ?? null
}

export async function GET() {
  const session = getServerSession()
  if (!session || session.role !== 'customer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const customerId = await getCustomerId(session.userId)
  if (!customerId) return NextResponse.json({ requests: [] })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('customer_requests')
    .select('*')
    .eq('customer_id', customerId)
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

  const customerId = await getCustomerId(session.userId)
  if (!customerId) {
    return NextResponse.json({ error: '고객 정보를 찾을 수 없습니다.' }, { status: 404 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('customer_requests')
    .insert({ customer_id: customerId, user_id: session.userId, content: content.trim() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ request: data }, { status: 201 })
}
