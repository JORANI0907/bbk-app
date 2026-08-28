import { NextRequest, NextResponse } from 'next/server'
import { AUDIT_COOKIE, checkAuditPassword, createAuditSession } from '@/lib/kg-audit/session'

/**
 * KG 심사관 격리 로그인.
 * 아이디 하나: kg-audit@bbkorea.co.kr
 * 비밀번호: 환경변수 KG_AUDITOR_PASSWORD 로 관리.
 */
const AUDITOR_EMAIL = 'kg-audit@bbkorea.co.kr'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { email?: string; password?: string }
    const email    = String(body.email    ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')

    if (email !== AUDITOR_EMAIL) {
      return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 })
    }
    if (!checkAuditPassword(password)) {
      return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 })
    }

    const token = await createAuditSession()

    const res = NextResponse.json({ success: true })
    res.cookies.set({ ...AUDIT_COOKIE, value: token })
    return res
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
