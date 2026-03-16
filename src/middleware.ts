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
  const pathname = request.nextUrl.pathname

  // 공개 경로
  const publicPaths = ['/login', '/signup', '/api/auth', '/api/sms', '/api/admin', '/api/webhooks']
  const isPublic = publicPaths.some(p => pathname.startsWith(p))

  const sessionToken = request.cookies.get('bbk_session')?.value
  const session = sessionToken ? await verifySession(sessionToken) : null

  if (!session && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (session) {
    const role = session.role

    if (pathname === '/') {
      if (role === 'admin') return NextResponse.redirect(new URL('/admin', request.url))
      if (role === 'worker') return NextResponse.redirect(new URL('/worker', request.url))
      if (role === 'customer') return NextResponse.redirect(new URL('/customer', request.url))
    }

    if (pathname.startsWith('/admin') && role !== 'admin') {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    if (pathname.startsWith('/worker') && role !== 'worker') {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    if (pathname.startsWith('/customer') && role !== 'customer') {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
