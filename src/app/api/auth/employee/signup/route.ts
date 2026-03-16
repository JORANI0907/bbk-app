import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createAuthUser, signInWithPassword } from '@/lib/auth-helpers'

export async function POST(request: NextRequest) {
  try {
    const { name, email, phone, password } = await request.json()

    if (!name?.trim() || !email?.trim() || !phone?.trim() || !password?.trim()) {
      return NextResponse.json({ error: '모든 항목을 입력해주세요.' }, { status: 400 })
    }

    const normalizedPhone = phone.replace(/-/g, '')
    if (!/^(010|011|016|017|018|019)\d{7,8}$/.test(normalizedPhone)) {
      return NextResponse.json({ error: '올바른 전화번호 형식이 아닙니다.' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: '비밀번호는 8자 이상이어야 합니다.' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const adminSupabase = createServiceClient()

    // 이메일 중복 확인
    const { data: existingEmail } = await adminSupabase
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .single()
    if (existingEmail) {
      return NextResponse.json({ error: '이미 사용 중인 이메일입니다.' }, { status: 409 })
    }

    // 전화번호 중복 확인
    const { data: existingPhone } = await adminSupabase
      .from('users')
      .select('id')
      .eq('phone', normalizedPhone)
      .single()
    if (existingPhone) {
      return NextResponse.json({ error: '이미 등록된 전화번호입니다.' }, { status: 409 })
    }

    // Supabase Auth 계정 생성
    const authUser = await createAuthUser(normalizedEmail, password, {
      role: 'worker',
      name: name.trim(),
    })

    // BBK users 테이블에 등록
    const { data: user, error: insertError } = await adminSupabase
      .from('users')
      .insert({
        auth_id: authUser.id,
        role: 'worker',
        name: name.trim(),
        phone: normalizedPhone,
        email: normalizedEmail,
        is_active: true,
      })
      .select('id, role, name')
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // 자동 로그인
    const session = await signInWithPassword(normalizedEmail, password)

    return NextResponse.json(
      {
        success: true,
        user: { id: user!.id, role: user!.role, name: user!.name },
        session: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        },
      },
      { status: 201 },
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('already registered') || msg.includes('already been registered')) {
      return NextResponse.json({ error: '이미 사용 중인 이메일입니다.' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
