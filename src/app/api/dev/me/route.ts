import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = getServerSession()
  if (!session) return NextResponse.json({ role: null, name: null, userId: null, isOwner: false })

  const ownerId = process.env.DEV_OWNER_ID
  const isOwner = !!ownerId && session.userId === ownerId
  if (!isOwner) return NextResponse.json({ role: null, name: null, userId: null, isOwner: false })

  return NextResponse.json({ role: session.role, name: session.name, userId: session.userId, isOwner: true })
}
