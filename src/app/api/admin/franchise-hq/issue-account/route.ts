import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createAuthUser, franchiseEmail } from '@/lib/auth-helpers'
import { getServerSession } from '@/lib/session'

/**
 * 회원관리에서 본사 계정 발급:
 * 1) Supabase Auth 사용자 생성 (franchiseEmail 방식)
 * 2) users 테이블에 role='franchise_hq' 행 생성
 * 3) franchise_hq.user_id 업데이트
 */
export async function POST(request: NextRequest) {
  const session = getServerSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { franchiseHqId, name, phone, password } = body as {
      franchiseHqId: string
      name: string
      phone: string
      password: string
    }

    if (!franchiseHqId || !name?.trim() || !phone?.trim() || !password?.trim()) {
      return NextResponse.json(
        { error: '본사·담당자명·연락처·비밀번호는 필수입니다.' },
        { status: 400 },
      )
    }
    if (password.length < 6) {
      return NextResponse.json({ error: '비밀번호는 6자 이상이어야 합니다.' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // 본사 존재 + 이미 계정 발급되지 않았는지 확인
    const { data: hq } = await supabase
      .from('franchise_hq')
      .select('id, user_id, brand_name')
      .eq('id', franchiseHqId)
      .single()

    if (!hq) {
      return NextResponse.json({ error: '본사를 찾을 수 없습니다.' }, { status: 404 })
    }
    if (hq.user_id) {
      return NextResponse.json({ error: '이미 계정이 발급된 본사입니다.' }, { status: 409 })
    }

    const normalizedPhone = phone.replace(/-/g, '').trim()

    // 동일 전화번호 중복 체크
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('phone', normalizedPhone)
      .maybeSingle()
    if (existingUser) {
      return NextResponse.json({ error: '이미 등록된 연락처입니다.' }, { status: 409 })
    }

    // 1. Supabase Auth 사용자 생성
    const email = franchiseEmail(normalizedPhone)
    const authUser = await createAuthUser(email, password, { role: 'franchise_hq' })

    // 2. users 행 생성 — email + password_hint도 함께 저장 (회원관리 UI 표시 정확성)
    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert({
        auth_id: authUser.id,
        role: 'franchise_hq',
        name: name.trim(),
        phone: normalizedPhone,
        email,
        password_hint: password,
        is_active: true,
      })
      .select('id')
      .single()
    if (userError || !newUser) {
      return NextResponse.json(
        { error: userError?.message ?? '사용자 등록 실패' },
        { status: 500 },
      )
    }

    // 3. franchise_hq.user_id 연결
    const { error: linkError } = await supabase
      .from('franchise_hq')
      .update({ user_id: newUser.id })
      .eq('id', franchiseHqId)
    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      userId: newUser.id,
      franchiseHqId: hq.id,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
