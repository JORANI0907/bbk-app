import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

/**
 * 카테고리 일괄 이름 변경 / 병합. admin 전용.
 *
 * Body: { from: string, to: string }
 * 동작: category=from 인 모든 활성 문구를 category=to 로 변경.
 * 삭제 = to='기타' 로 병합하면 됨 (별도 delete API 불필요).
 * to 이름이 이미 존재하면 자연스럽게 병합.
 */
export async function POST(request: NextRequest) {
  const session = getServerSession()
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  if (session.role !== 'admin') {
    return NextResponse.json({ error: '관리자만 사용할 수 있습니다.' }, { status: 403 })
  }

  const body = await request.json()
  const from = String(body.from ?? '').trim()
  const to = String(body.to ?? '').trim()

  if (!from) return NextResponse.json({ error: '원본 카테고리가 필요합니다.' }, { status: 400 })
  if (!to) return NextResponse.json({ error: '대상 카테고리가 필요합니다.' }, { status: 400 })
  if (from === to) return NextResponse.json({ success: true, updated: 0 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('message_snippets')
    .update({
      category: to,
      updated_by: session.userId,
      updated_at: new Date().toISOString(),
    })
    .eq('category', from)
    .is('deleted_at', null)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, updated: data?.length ?? 0 })
}
