import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { signSession } from '@/lib/session'

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const supabase = createServiceClient()

    const { data: tokenRow, error } = await supabase
      .from('portal_preview_tokens')
      .select('id, used_at, expires_at, target_user_id')
      .eq('token', params.token)
      .single()

    if (error || !tokenRow) {
      return NextResponse.redirect(new URL('/login?error=invalid_token', request.url))
    }

    if (tokenRow.used_at) {
      return NextResponse.redirect(new URL('/login?error=token_used', request.url))
    }

    if (new Date(tokenRow.expires_at) < new Date()) {
      return NextResponse.redirect(new URL('/login?error=token_expired', request.url))
    }

    const { data: targetUser, error: userError } = await supabase
      .from('users')
      .select('id, name, role')
      .eq('id', tokenRow.target_user_id)
      .single()

    if (userError || !targetUser) {
      return NextResponse.redirect(new URL('/login?error=user_not_found', request.url))
    }

    // 일회용 처리
    await supabase
      .from('portal_preview_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', tokenRow.id)

    const sessionToken = signSession({
      userId: targetUser.id,
      role: 'customer',
      name: targetUser.name,
      isPreview: true,
    })

    const response = NextResponse.redirect(new URL('/customer', request.url))
    // 기존 bbk_session(관리자)을 건드리지 않고 별도 미리보기 쿠키만 설정
    response.cookies.set('bbk_preview_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60,
      path: '/',
    })

    return response
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, request.url))
  }
}
