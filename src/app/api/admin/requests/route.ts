import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { sendSlack } from '@/lib/slack'

const ALLOWED_POST = ['category', 'content', 'extra_data']
const ALLOWED_PATCH_ADMIN = ['status', 'admin_memo']

export async function GET(request: NextRequest) {
  const session = getServerSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? '20')))
  const offset = (page - 1) * limit

  const supabase = createServiceClient()

  let query = supabase
    .from('requests')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('status', status)

  // worker는 본인 요청만
  if (session.role === 'worker') {
    query = query.eq('requester_id', session.userId)
  }

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], total: count ?? 0 })
}

export async function POST(request: NextRequest) {
  const session = getServerSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const body = await request.json()
  const insert: Record<string, unknown> = {
    requester_id: session.userId,
    requester_role: session.role,
    requester_name: session.name,
    status: 'pending',
    requester_read: true,
  }

  for (const key of ALLOWED_POST) {
    if (key in body) insert[key] = body[key]
  }

  if (!insert.category || !insert.content) {
    return NextResponse.json({ error: '카테고리와 내용은 필수입니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('requests')
    .insert(insert)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const roleLabel = session.role === 'worker' ? '직원' : '관리자'
  const preview = String(insert.content ?? '').slice(0, 50)
  sendSlack(`[요청] 새 요청 등록 · ${insert.requester_name ?? ''} (${roleLabel}) · ${insert.category ?? ''} · ${preview}`).catch(() => {})

  return NextResponse.json({ data }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const session = getServerSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const body = await request.json()
  const { id, action, ...rest } = body

  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

  const supabase = createServiceClient()

  // worker: 읽음 처리
  if (action === 'mark_read') {
    const { error } = await supabase
      .from('requests')
      .update({ requester_read: true })
      .eq('id', id)
      .eq('requester_id', session.userId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // admin: 상태 변경
  if (session.role !== 'admin') {
    return NextResponse.json({ error: '관리자 전용' }, { status: 403 })
  }

  // Slack용 요청 내용 조회
  const { data: reqRow } = await supabase
    .from('requests')
    .select('category, content, requester_name')
    .eq('id', id)
    .maybeSingle()

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    checked_by: session.userId,
    checked_at: new Date().toISOString(),
    requester_read: false,
  }
  for (const key of ALLOWED_PATCH_ADMIN) {
    if (key in rest) updates[key] = rest[key]
  }

  const { error } = await supabase
    .from('requests')
    .update(updates)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (reqRow) {
    const statusLabel = rest.status === 'done' ? '완료' : rest.status === 'rejected' ? '반려' : '처리'
    const preview = String(reqRow.content ?? '').slice(0, 40)
    sendSlack(`[요청] 요청 ${statusLabel} · ${reqRow.requester_name ?? ''} · ${reqRow.category ?? ''} · ${preview}`).catch(() => {})
  }

  return NextResponse.json({ success: true })
}
