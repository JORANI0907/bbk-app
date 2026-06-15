import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const session = getServerSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
    }

    const { targetUserId } = await request.json()
    if (!targetUserId) {
      return NextResponse.json({ error: '대상 사용자 ID가 필요합니다.' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { data: targetUser, error: userError } = await supabase
      .from('users')
      .select('id, role, name')
      .eq('id', targetUserId)
      .single()

    if (userError || !targetUser) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 })
    }

    if (targetUser.role !== 'customer') {
      return NextResponse.json({ error: '고객 계정만 포털 미리보기가 가능합니다.' }, { status: 400 })
    }

    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

    const { error: insertError } = await supabase.from('portal_preview_tokens').insert({
      token,
      target_user_id: targetUserId,
      admin_user_id: session.userId,
      expires_at: expiresAt,
    })

    if (insertError) {
      return NextResponse.json({ error: '토큰 생성에 실패했습니다.' }, { status: 500 })
    }

    return NextResponse.json({ token })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
