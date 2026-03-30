import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // bbk_access_token은 non-httpOnly 쿠키 — JS에서 읽어 Supabase RLS authenticated 역할 활성화
  const accessToken = typeof document !== 'undefined'
    ? document.cookie.match(/(?:^|;)\s*bbk_access_token=([^;]+)/)?.[1]
    : undefined

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    accessToken
      ? { global: { headers: { Authorization: `Bearer ${decodeURIComponent(accessToken)}` } } }
      : undefined
  )
}
