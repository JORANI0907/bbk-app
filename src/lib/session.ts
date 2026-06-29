import crypto from 'crypto'
import { cookies } from 'next/headers'

const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'bbk-secret'

export function signSession(payload: object): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url')
  return `${data}.${sig}`
}

export function verifySession(token: string): Record<string, string> | null {
  try {
    const [data, sig] = token.split('.')
    const expected = crypto.createHmac('sha256', SECRET).update(data).digest('base64url')
    if (sig !== expected) return null
    return JSON.parse(Buffer.from(data, 'base64url').toString())
  } catch {
    return null
  }
}

export function getServerSession(): { userId: string; role: string; name: string } | null {
  const cookieStore = cookies()
  const token = cookieStore.get('bbk_session')?.value
  if (!token) return null
  const payload = verifySession(token)
  if (!payload) return null
  return payload as unknown as { userId: string; role: string; name: string }
}

// 고객 포털 전용: bbk_preview_session(관리자 미리보기/본사 지점전환) 우선, 없으면 bbk_session
export function getCustomerSession(): {
  userId: string
  role: string
  name: string
  isPreview?: boolean
  originRole?: string
  franchiseHqId?: string
} | null {
  const cookieStore = cookies()
  const previewToken = cookieStore.get('bbk_preview_session')?.value
  if (previewToken) {
    const payload = verifySession(previewToken)
    if (payload?.isPreview) {
      return payload as unknown as {
        userId: string
        role: string
        name: string
        isPreview: true
        originRole?: string
        franchiseHqId?: string
      }
    }
  }
  const token = cookieStore.get('bbk_session')?.value
  if (!token) return null
  const payload = verifySession(token)
  if (!payload) return null
  return payload as unknown as { userId: string; role: string; name: string }
}

// 본사 포털 전용: 본사 로그인 세션만 허용
export function getFranchiseSession(): {
  userId: string
  role: string
  name: string
  franchiseHqId?: string
} | null {
  const cookieStore = cookies()
  const token = cookieStore.get('bbk_session')?.value
  if (!token) return null
  const payload = verifySession(token)
  if (!payload || payload.role !== 'franchise_hq') return null
  return payload as unknown as {
    userId: string
    role: string
    name: string
    franchiseHqId?: string
  }
}
