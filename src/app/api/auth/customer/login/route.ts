import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { signInWithPassword, customerEmail } from '@/lib/auth-helpers'
import { recordLoginLog } from '@/lib/login-log'

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown'

  try {
    const { phone, password } = await request.json()

    if (!phone?.trim() || !password?.trim()) {
      return NextResponse.json({ error: '연락처와 비밀번호를 입력해주세요.' }, { status: 400 })
    }

    const normalizedPhone = phone.replace(/-/g, '')
    const email = customerEmail(normalizedPhone)

    // Supabase Auth 로그인
    let session
    try {
      session = await signInWithPassword(email, password)
    } catch (authError) {
      const authMsg = authError instanceof Error ? authError.message : String(authError)
      if (authMsg.includes('Invalid login credentials')) {
        return NextResponse.json({ error: '연락처 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 })
      }
      throw authError
    }

    // BBK users 테이블 조회
    const adminSupabase = createServiceClient()
    const { data: user, error: userError } = await adminSupabase
      .from('users')
      .select('id, role, name, is_active')
      .eq('auth_id', session.user.id)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: '등록되지 않은 계정입니다. 관리자에게 문의하세요.' }, { status: 404 })
    }

    if (!user.is_active) {
      recordLoginLog(user.id, user.role, false, ip, '비활성화 계정').catch(() => {})
      return NextResponse.json({ error: '비활성화된 계정입니다. 관리자에게 문의하세요.' }, { status: 403 })
    }

    if (user.role !== 'customer') {
      return NextResponse.json({ error: '직원은 직원/관리자 탭에서 로그인해주세요.' }, { status: 403 })
    }

    recordLoginLog(user.id, user.role, true, ip).catch(() => {})

    return NextResponse.json({
      success: true,
      user: { id: user.id, role: user.role, name: user.name },
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
