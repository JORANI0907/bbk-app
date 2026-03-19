import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email?.trim()) {
      return NextResponse.json({ error: '이메일을 입력해주세요.' }, { status: 400 })
    }

    const origin = request.headers.get('origin') ?? 'https://bbk-korea-app.netlify.app'
    const redirectTo = `${origin}/reset-password`

    const res = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON_KEY,
      },
      body: JSON.stringify({ email: email.trim().toLowerCase(), redirect_to: redirectTo }),
    })

    // Supabase returns 200 even if email not found (security: no email enumeration)
    if (!res.ok) {
      const data = await res.json()
      return NextResponse.json({ error: data.error_description ?? data.msg ?? '요청 실패' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
