import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

/**
 * 문자 단축어 개별 수정·삭제. admin 전용.
 * worker 는 조회+복사만 가능 (list route 에서 필터).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = getServerSession()
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  if (session.role !== 'admin') {
    return NextResponse.json({ error: '관리자만 수정할 수 있습니다.' }, { status: 403 })
  }

  const { id } = params
  if (!id) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 })

  const supabase = createServiceClient()
  const body = await request.json()

  const updates: Record<string, unknown> = {
    updated_by: session.userId,
    updated_at: new Date().toISOString(),
  }

  if ('title' in body) {
    const title = String(body.title ?? '').trim()
    if (!title) return NextResponse.json({ error: '제목은 비울 수 없습니다.' }, { status: 400 })
    updates.title = title
  }
  if ('body' in body) {
    const bodyText = String(body.body ?? '').trim()
    if (!bodyText) return NextResponse.json({ error: '본문은 비울 수 없습니다.' }, { status: 400 })
    updates.body = bodyText
  }
  if ('category' in body) {
    updates.category = String(body.category ?? '기타').trim() || '기타'
  }
  if ('worker_visible' in body) {
    updates.worker_visible = body.worker_visible === true
  }

  const { data, error } = await supabase
    .from('message_snippets')
    .update(updates)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: '단축어를 찾을 수 없습니다.' }, { status: 404 })

  return NextResponse.json({ snippet: data })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = getServerSession()
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  if (session.role !== 'admin') {
    return NextResponse.json({ error: '관리자만 삭제할 수 있습니다.' }, { status: 403 })
  }

  const { id } = params
  if (!id) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('message_snippets')
    .update({ deleted_at: new Date().toISOString(), updated_by: session.userId })
    .eq('id', id)
    .is('deleted_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
