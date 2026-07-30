/**
 * 현재 세션 정보 조회 (userId, role, name).
 * 클라이언트에서 로그인 사용자 컨텍스트 필요 시 사용.
 */

import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session'

export async function GET() {
  const session = getServerSession()
  if (!session) return NextResponse.json({ session: null }, { status: 200 })
  return NextResponse.json({ session })
}
