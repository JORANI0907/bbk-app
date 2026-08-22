import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

/**
 * 복사 통계 카운트 — 사용자가 [복사] 버튼 누를 때 호출.
 * usage_count 증가 + last_used_at 갱신.
 * admin/worker 모두 호출 가능 (worker 는 자기가 볼 수 있는 것만).
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

  // 워커는 worker_visible 확인 후 카운트 (권한 검증)
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

  // usage_count 증가 + last_used_at 갱신 (RPC 없이 두 단계 처리 — 경쟁 위험 낮음)
  const { data: current } = await supabase
    .from('message_snippets')
    .select('usage_count')
    .eq('id', id)
    .single()

  const nextCount = (current?.usage_count ?? 0) + 1
  const { error } = await supabase
    .from('message_snippets')
    .update({
      usage_count: nextCount,
      last_used_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, usage_count: nextCount })
}
