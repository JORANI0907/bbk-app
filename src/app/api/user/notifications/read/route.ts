import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

/**
 * PATCH /api/user/notifications/read
 * body: { all: true } — 전체 읽음 처리
 * body: { id: string } — 단건 읽음 처리
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = getServerSession()
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const body = await request.json() as { all?: boolean; id?: string }
    const supabase = createServiceClient()

    if (body.all === true) {
      const { error } = await supabase
        .from('in_app_notifications')
        .update({ is_read: true })
        .eq('user_id', session.userId)
        .eq('is_read', false)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true })
    }

    if (body.id) {
      const { error } = await supabase
        .from('in_app_notifications')
        .update({ is_read: true })
        .eq('id', body.id)
        .eq('user_id', session.userId)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true })
    }

    return NextResponse.json(
      { error: 'all: true 또는 id를 전달하세요.' },
      { status: 400 },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
