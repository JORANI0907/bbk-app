import { NextRequest, NextResponse } from 'next/server'
import { signSession } from '@/lib/session'

// POST: 세션 쿠키 설정
export async function POST(request: NextRequest) {
  const { userId, role, name, accessToken, refreshToken } = await request.json()

  const sessionToken = signSession({ userId, role, name })

  const response = NextResponse.json({ success: true })

  // BBK 세션 쿠키 (역할 기반 라우팅용)
  response.cookies.set('bbk_session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7일
    path: '/',
  })

  // Supabase 액세스 토큰
  response.cookies.set('bbk_access_token', accessToken, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60, // 1시간
    path: '/',
  })

  response.cookies.set('bbk_refresh_token', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })

  return response
}

// DELETE: 로그아웃
export async function DELETE() {
  const response = NextResponse.json({ success: true })
  response.cookies.delete('bbk_session')
  response.cookies.delete('bbk_access_token')
  response.cookies.delete('bbk_refresh_token')
  return response
}
