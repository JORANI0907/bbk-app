import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { signInWithPassword, customerEmail } from '@/lib/auth-helpers'
import { sendSlack } from '@/lib/slack'

export async function POST(request: NextRequest) {
  try {
    const { phone, password } = await request.json()

    if (!phone?.trim() || !password?.trim()) {
      return NextResponse.json({ error: '연락처와 비밀번호를 입력해주세요.' }, { status: 400 })
    }

    const normalizedPhone = phone.replace(/-/g, '')
    const email = customerEmail(normalizedPhone)

    const session = await signInWithPassword(email, password)

    const supabase = createServiceClient()
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, role, name, is_active')
      .eq('auth_id', session.user.id)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: '등록되지 않은 계정입니다. 관리자에게 문의하세요.' }, { status: 404 })
    }

    if (!user.is_active) {
      return NextResponse.json({ error: '비활성화된 계정입니다. 관리자에게 문의하세요.' }, { status: 403 })
    }

    if (user.role === 'admin' || user.role === 'worker') {
      sendSlack(`[로그인] ${user.name} (${user.role})`).catch(() => {})
    }

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
    if (msg.includes('Invalid login credentials')) {
      return NextResponse.json({ error: '연락처 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
