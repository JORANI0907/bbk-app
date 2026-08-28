import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export function createClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server component에서는 무시
          }
        },
      },
    }
  )
}

// Service role: RLS 우회, 쿠키 불필요
//
// Next.js 14 App Router 는 글로벌 fetch 를 패치해 Data Cache 로 응답을 캐시함.
// 이 때문에 Supabase 를 통한 DB 조회 결과도 route handler 응답이 굳어져
// updated_at 이 17시간 넘게 stale 하게 반환되는 광범위 버그 발생.
// (세부창 저장 후 새로고침 시 옛 값이 계속 표시되던 실제 근본 원인.)
//
// 모든 service client fetch 에 { cache: 'no-store' } 를 강제해 Data Cache 를 우회.
// admin 도구는 실시간성이 최우선이므로 캐시 이득보다 정합성 우선.
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...(init ?? {}), cache: 'no-store' }),
      },
    }
  )
}
