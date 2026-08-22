import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

/**
 * 문자 단축어 라이브러리 — 리스트 조회 (role 기반 필터) + 신규 등록.
 *
 * - admin: 전체 조회, 등록/수정/삭제 가능
 * - worker: worker_visible=true 만 조회, 편집·삭제 금지
 */
export async function GET(request: NextRequest) {
  const session = getServerSession()
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  if (session.role !== 'admin' && session.role !== 'worker') {
    return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 })
  }

  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  const search = searchParams.get('search')

  let query = supabase
    .from('message_snippets')
    .select('*')
    .is('deleted_at', null)
    .order('category', { ascending: true })
    .order('title', { ascending: true })

  // 워커는 공유 플래그가 있는 것만
  if (session.role === 'worker') {
    query = query.eq('worker_visible', true)
  }

  if (category && category !== 'all') {
    query = query.eq('category', category)
  }

  if (search) {
    // 제목 + 본문 통합 검색 (대소문자 무시)
    query = query.or(`title.ilike.%${search}%,body.ilike.%${search}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ snippets: data ?? [] })
}

export async function POST(request: NextRequest) {
  const session = getServerSession()
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  if (session.role !== 'admin') {
    return NextResponse.json({ error: '관리자만 등록할 수 있습니다.' }, { status: 403 })
  }

  const supabase = createServiceClient()
  const body = await request.json()

  const title = String(body.title ?? '').trim()
  const bodyText = String(body.body ?? '').trim()
  const category = String(body.category ?? '기타').trim() || '기타'
  const workerVisible = body.worker_visible === true

  if (!title) return NextResponse.json({ error: '제목은 필수입니다.' }, { status: 400 })
  if (!bodyText) return NextResponse.json({ error: '본문은 필수입니다.' }, { status: 400 })

  const { data, error } = await supabase
    .from('message_snippets')
    .insert({
      category,
      title,
      body: bodyText,
      worker_visible: workerVisible,
      created_by: session.userId,
      updated_by: session.userId,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ snippet: data }, { status: 201 })
}
