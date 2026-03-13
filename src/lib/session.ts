import crypto from 'crypto'

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
