import { NextResponse } from 'next/server'
import { AUDIT_COOKIE } from '@/lib/kg-audit/session'

export async function POST() {
  const res = NextResponse.redirect(new URL('/kg-audit/login', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'))
  res.cookies.set({ ...AUDIT_COOKIE, value: '', maxAge: 0 })
  return res
}
