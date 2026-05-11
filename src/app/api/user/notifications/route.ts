import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

const PAGE_SIZE = 30

export async function GET(request: NextRequest) {
  try {
    const session = getServerSession()
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const userType = searchParams.get('userType')
    const page = Math.max(0, parseInt(searchParams.get('page') ?? '0', 10))

    // 요청한 userId가 세션 userId와 일치하는지 검증
    if (!userId || userId !== session.userId) {
      return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 })
    }

    if (!userType || !['admin', 'worker', 'customer'].includes(userType)) {
      return NextResponse.json({ error: '유효하지 않은 사용자 유형입니다.' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { data, error, count } = await supabase
      .from('notification_history')
      .select('*', { count: 'exact' })
      .eq('recipient_type', userType)
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      data: data ?? [],
      total: count ?? 0,
      page,
      pageSize: PAGE_SIZE,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
