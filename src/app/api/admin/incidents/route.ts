import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { sendSlack } from '@/lib/slack'

const ALLOWED_POST = ['type', 'incident_date', 'location', 'description', 'action_taken']
const ALLOWED_PATCH_ADMIN = ['status', 'admin_comment']

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
    .from('incident_reports')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('status', status)

  // worker는 본인 경위서만
  if (session.role === 'worker') {
    query = query.eq('author_id', session.userId)
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
    author_id: session.userId,
    author_name: session.name,
    status: 'pending',
  }

  for (const key of ALLOWED_POST) {
    if (key in body) insert[key] = body[key]
  }

  if (!insert.type || !insert.incident_date || !insert.description) {
    return NextResponse.json({ error: '유형, 날짜, 경위내용은 필수입니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('incident_reports')
    .insert(insert)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Slack 알림 (fire-and-forget)
  const title = (insert.type as string) ?? '경위서'
  sendSlack(`[경위서] ${title} 제출 (${session.name})`).catch(() => {})

  return NextResponse.json({ data }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const session = getServerSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: '관리자 전용' }, { status: 403 })

  const body = await request.json()
  const { id, ...rest } = body

  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  for (const key of ALLOWED_PATCH_ADMIN) {
    if (key in rest) updates[key] = rest[key]
  }

  if (Object.keys(updates).length <= 1) {
    return NextResponse.json({ error: '업데이트할 필드가 없습니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('incident_reports')
    .update(updates)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
