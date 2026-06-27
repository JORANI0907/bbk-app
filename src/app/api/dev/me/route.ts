import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = getServerSession()
  const ownerId = process.env.DEV_OWNER_ID

  if (!ownerId) return NextResponse.json({ role: null, name: null, userId: null, isOwner: false })

  // Case 1: 현재 세션이 오너 → bbk_dev_owner 쿠키 발급
  if (session && session.userId === ownerId) {
    const response = NextResponse.json({
      role: session.role, name: session.name, userId: session.userId, isOwner: true,
    })
    response.cookies.set('bbk_dev_owner', ownerId, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    })
    return response
  }

  // Case 2: 다른 역할로 전환 중 — bbk_dev_owner 쿠키로 오너 확인
  const cookieStore = cookies()
  const devOwnerCookie = cookieStore.get('bbk_dev_owner')
  if (devOwnerCookie?.value === ownerId) {
    return NextResponse.json({
      role: session?.role ?? null,
      name: session?.name ?? null,
      userId: session?.userId ?? null,
      isOwner: true,
    })
  }

  return NextResponse.json({ role: null, name: null, userId: null, isOwner: false })
}
