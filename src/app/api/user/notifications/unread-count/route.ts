import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

/**
 * GET /api/user/notifications/unread-count?userId=xxx
 * 응답: { count: number }
 */
export async function GET(request: NextRequest) {
  try {
    const session = getServerSession()
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId || userId !== session.userId) {
      return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 })
    }

    const supabase = createServiceClient()
    const { count, error } = await supabase
      .from('in_app_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ count: count ?? 0 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
