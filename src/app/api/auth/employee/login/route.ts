import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { signInWithPassword } from '@/lib/auth-helpers'
import { sendSlack } from '@/lib/slack'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email?.trim() || !password?.trim()) {
      return NextResponse.json({ error: '이메일과 비밀번호를 입력해주세요.' }, { status: 400 })
    }

    // Supabase Auth 로그인
    const session = await signInWithPassword(email.trim().toLowerCase(), password)

    // BBK users 테이블 조회
    const adminSupabase = createServiceClient()
    const { data: user, error: userError } = await adminSupabase
      .from('users')
      .select('id, role, name, is_active')
      .eq('auth_id', session.user.id)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: '등록되지 않은 계정입니다.' }, { status: 404 })
    }

    if (!user.is_active) {
      const msg = user.role === 'worker'
        ? '관리자 승인 대기 중인 계정입니다. 승인 후 로그인이 가능합니다.'
        : '비활성화된 계정입니다. 관리자에게 문의하세요.'
      return NextResponse.json({ error: msg }, { status: 403 })
    }

    if (user.role === 'customer') {
      return NextResponse.json({ error: '고객은 고객 탭에서 로그인해주세요.' }, { status: 403 })
    }

    // Slack 알림 (fire-and-forget)
    sendSlack(`[로그인] ${user.name} (${user.role}) 로그인`).catch(() => {})

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
    // Supabase 인증 오류를 사용자 친화적 메시지로 변환
    if (msg.includes('Invalid login credentials')) {
      return NextResponse.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
