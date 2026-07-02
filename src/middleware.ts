import { NextResponse, type NextRequest } from 'next/server'

const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'bbk-secret'

async function verifySession(token: string): Promise<Record<string, string> | null> {
  try {
    const [data, sig] = token.split('.')
    if (!data || !sig) return null

    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const signedBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(data))
    const expected = btoa(String.fromCharCode(...Array.from(new Uint8Array(signedBuffer))))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

    if (sig !== expected) return null
    return JSON.parse(atob(data.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return null
  }
}

export async function middleware(request: NextRequest) {
  try {
    const pathname = request.nextUrl.pathname

    // /form.html → /bbk-care 영구 리다이렉트
    if (pathname === '/form.html') {
      return NextResponse.redirect(new URL('/bbk-care', request.url), 301)
    }

    // 세션 검증 없이 즉시 통과 (crypto 연산 생략)
    if (pathname.startsWith('/forgot-password') || pathname.startsWith('/reset-password')) {
      return NextResponse.next()
    }

    // 공개 경로 (정적 HTML 포함)
    if (pathname.endsWith('.html')) return NextResponse.next()

    // 데모 진입 경로 (비로그인 사용자가 PG/서비스 안내 확인용)
    const isDemoPath =
      pathname === '/' ||
      pathname === '/schedule' ||
      pathname === '/care-manual' ||
      pathname === '/guide'

    const publicPaths = ['/login', '/signup', '/install', '/quote', '/bbk-care', '/sign', '/portal-preview', '/api/auth', '/api/sms', '/api/admin', '/api/webhooks', '/api/form', '/api/cron', '/api/contracts', '/api/push', '/api/juso', '/terms', '/privacy', '/apply', '/api/apply', '/portone', '/api/portone/webhook', '/api/portone/pay-info', '/api/portone/complete']
    const isPublic = isDemoPath || publicPaths.some(p => pathname.startsWith(p))

    const sessionToken = request.cookies.get('bbk_session')?.value
    const session = sessionToken ? await verifySession(sessionToken) : null

    if (!session && !isPublic) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    if (session) {
      const role = session.role

      // 루트 경로 리디렉션
      if (pathname === '/') {
        if (role === 'admin') return NextResponse.redirect(new URL('/admin', request.url))
        if (role === 'worker') return NextResponse.redirect(new URL('/admin', request.url))
        if (role === 'customer') return NextResponse.redirect(new URL('/customer', request.url))
        if (role === 'franchise_hq') return NextResponse.redirect(new URL('/franchise', request.url))
      }

      // 어드민 경로: admin과 worker 모두 허용
      if (pathname.startsWith('/admin') && role !== 'admin' && role !== 'worker') {
        return NextResponse.redirect(new URL('/login', request.url))
      }

      // 워커 경로: worker가 /worker 방문 시 /admin으로 리디렉션
      if (pathname.startsWith('/worker') && role === 'worker') {
        if (pathname.startsWith('/worker/schedule/')) {
          const id = pathname.replace('/worker/schedule/', '')
          return NextResponse.redirect(new URL(`/admin/schedule/${id}`, request.url))
        }
        return NextResponse.redirect(new URL('/admin', request.url))
      }

      if (pathname.startsWith('/worker') && role !== 'worker' && role !== 'admin') {
        return NextResponse.redirect(new URL('/login', request.url))
      }

      // 본사 포털: franchise_hq만 허용
      if (pathname.startsWith('/franchise') && role !== 'franchise_hq') {
        return NextResponse.redirect(new URL('/login', request.url))
      }

      if (pathname.startsWith('/customer') && role !== 'customer') {
        // 관리자 미리보기 / 본사 지점전환 쿠키 별도 확인
        const previewToken = request.cookies.get('bbk_preview_session')?.value
        const previewPayload = previewToken ? await verifySession(previewToken) : null
        if (!previewPayload?.isPreview) {
          // 본사 로그인 상태로 /customer 직접 접근 시 본사 홈으로 안내
          if (role === 'franchise_hq') {
            return NextResponse.redirect(new URL('/franchise', request.url))
          }
          return NextResponse.redirect(new URL('/login', request.url))
        }
      }
    }

    return NextResponse.next()
  } catch {
    // 엣지 함수 크래시 방지: 오류 발생 시 요청 통과
    return NextResponse.next()
  }
}

export const config = {
  matcher: [
    '/form.html',
    '/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|html)$).*)',
  ],
}
