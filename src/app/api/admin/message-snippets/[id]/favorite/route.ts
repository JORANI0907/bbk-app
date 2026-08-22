import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

/**
 * 즐겨찾기 토글 — admin/worker 모두 사용 가능 (worker 는 자기가 볼 수 있는 것만).
 * POST: 즐겨찾기 추가 (upsert)
 * DELETE: 즐겨찾기 해제
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = getServerSession()
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  if (session.role !== 'admin' && session.role !== 'worker') {
    return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 })
  }

  const { id } = params
  if (!id) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 })

  const supabase = createServiceClient()

  // 워커는 worker_visible 만 즐겨찾기 가능 (직접 접근 방어)
  if (session.role === 'worker') {
    const { data: snippet } = await supabase
      .from('message_snippets')
      .select('worker_visible')
      .eq('id', id)
      .is('deleted_at', null)
      .single()
    if (!snippet || !snippet.worker_visible) {
      return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 })
    }
  }

  const { error } = await supabase
    .from('message_snippet_favorites')
    .upsert({ user_id: session.userId, snippet_id: id })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, is_favorite: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = getServerSession()
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { id } = params
  if (!id) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('message_snippet_favorites')
    .delete()
    .eq('user_id', session.userId)
    .eq('snippet_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, is_favorite: false })
}
