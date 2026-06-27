import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available' }, { status: 404 })
  }
  const session = getServerSession()
  if (!session) return NextResponse.json({ role: null, name: null, userId: null })
  return NextResponse.json({ role: session.role, name: session.name, userId: session.userId })
}
