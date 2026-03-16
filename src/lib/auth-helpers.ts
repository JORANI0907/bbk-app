const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function createAuthUser(
  email: string,
  password: string,
  metadata: Record<string, unknown>,
) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: metadata }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message ?? data.error ?? '사용자 생성 실패')
  return data as { id: string; email: string }
}

export async function updateAuthUserPassword(authId: string, password: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${authId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message ?? data.error ?? '비밀번호 변경 실패')
  return data
}

export async function signInWithPassword(email: string, password: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description ?? data.error ?? '로그인 실패')
  return data as { access_token: string; refresh_token: string; user: { id: string } }
}

/** 고객용 가상 이메일 (전화번호 기반) */
export function customerEmail(phone: string) {
  return `${phone.replace(/-/g, '')}@bbkorea.app`
}
