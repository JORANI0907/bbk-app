import { NextRequest, NextResponse } from 'next/server'
import { signSession, getServerSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  const session = getServerSession()
  const ownerId = process.env.DEV_OWNER_ID
  if (!session || !ownerId || session.userId !== ownerId) {
    return NextResponse.json({ error: 'Not available' }, { status: 404 })
  }

  const body = await request.json() as { userId?: string; role?: string; name?: string }
  const { userId, role, name } = body

  if (!userId || !role || !name) {
    return NextResponse.json({ error: 'userId, role, name 필수' }, { status: 400 })
  }

  const token = signSession({ userId, role, name })
  const response = NextResponse.json({ success: true })

  response.cookies.set('bbk_session', token, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })

  return response
}
