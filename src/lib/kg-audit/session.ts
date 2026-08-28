/**
 * KG 심사관 전용 격리 세션 유틸.
 *
 * 기존 users/workers 인증 시스템과 완전 분리.
 * HMAC-SHA256 서명 쿠키만으로 게이팅.
 * 환경변수 KG_AUDITOR_PASSWORD 로 비밀번호 관리.
 *
 * 심사 통과 후: 이 파일과 /kg-audit 폴더 통째로 삭제.
 */
import { cookies } from 'next/headers'

const COOKIE_NAME = 'kg_audit_session'
const SECRET      = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'bbk-secret'
const MAX_AGE     = 60 * 60 * 8 // 8시간

function base64UrlEncode(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...Array.from(new Uint8Array(buffer))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function sign(payload: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const buffer = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return base64UrlEncode(buffer)
}

export async function createAuditSession(): Promise<string> {
  const payload = JSON.stringify({ role: 'kg-auditor', iat: Date.now() })
  const data    = base64UrlEncode(new TextEncoder().encode(payload).buffer as ArrayBuffer)
  const sig     = await sign(data)
  return `${data}.${sig}`
}

export async function verifyAuditToken(token: string | undefined): Promise<boolean> {
  if (!token) return false
  const [data, sig] = token.split('.')
  if (!data || !sig) return false
  const expected = await sign(data)
  return expected === sig
}

export async function requireAuditSession(): Promise<boolean> {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  return verifyAuditToken(token)
}

export const AUDIT_COOKIE = {
  name:     COOKIE_NAME,
  maxAge:   MAX_AGE,
  httpOnly: true,
  sameSite: 'lax' as const,
  secure:   process.env.NODE_ENV === 'production',
  path:     '/',
}

export function checkAuditPassword(input: string): boolean {
  const expected = process.env.KG_AUDITOR_PASSWORD ?? ''
  if (!expected) return false
  return input === expected
}
