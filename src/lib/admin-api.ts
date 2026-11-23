/** 관리자 API 라우트 공용 — 세션 확인과 응답 봉투 */
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session'

export type AdminSession = { userId: string; role: string; name: string }

export function requireAdminSession(opts: { allowWorker?: boolean } = {}): AdminSession | NextResponse {
  const session = getServerSession()
  const roles = opts.allowWorker ? ['admin', 'worker'] : ['admin']
  if (!session || !roles.includes(session.role)) {
    return NextResponse.json({ success: false, error: '권한이 없습니다.' }, { status: 403 })
  }
  return session
}

export const isDenied = (v: unknown): v is NextResponse => v instanceof NextResponse
export const apiOk = <T,>(data: T, status = 200) => NextResponse.json({ success: true, data }, { status })
export const apiFail = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status })
export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))
