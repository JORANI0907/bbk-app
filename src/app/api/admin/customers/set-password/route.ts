/**
 * 관리자가 고객의 포털 로그인 비밀번호를 설정/변경하는 API
 * POST /api/admin/customers/set-password
 * Body: { customer_id, name, phone, password }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createAuthUser, updateAuthUserEmailAndPassword, customerEmail } from '@/lib/auth-helpers'

export async function POST(request: NextRequest) {
  try {
    const { customer_id, name, phone, password } = await request.json()

    if (!customer_id || !name?.trim() || !phone?.trim() || !password?.trim()) {
      return NextResponse.json({ error: '모든 항목을 입력해주세요.' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: '비밀번호는 6자 이상이어야 합니다.' }, { status: 400 })
    }

    const normalizedPhone = phone.replace(/-/g, '')
    const email = customerEmail(normalizedPhone)
    const adminSupabase = createServiceClient()

    // 기존 users 레코드 확인 (전화번호 기준)
    const { data: existingUser } = await adminSupabase
      .from('users')
      .select('id, auth_id')
      .eq('phone', normalizedPhone)
      .eq('role', 'customer')
      .single()

    let userId: string

    if (existingUser) {
      userId = existingUser.id

      // Auth 계정이 있으면 이메일+비밀번호 모두 업데이트 (기존 OTP 계정에 이메일 없을 수 있음)
      if (existingUser.auth_id) {
        await updateAuthUserEmailAndPassword(existingUser.auth_id, email, password)
      } else {
        // Auth 계정이 없으면 새로 생성
        const authUser = await createAuthUser(email, password, {
          role: 'customer',
          name: name.trim(),
        })
        await adminSupabase
          .from('users')
          .update({ auth_id: authUser.id })
          .eq('id', existingUser.id)
      }
    } else {
      // users 레코드 자체가 없으면 Auth + users 모두 생성
      let authId: string
      try {
        const authUser = await createAuthUser(email, password, {
          role: 'customer',
          name: name.trim(),
        })
        authId = authUser.id
      } catch (e) {
        // 이미 Auth 계정이 있는 경우 비밀번호 업데이트는 auth_id를 먼저 찾아야 함
        const msg = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ error: `계정 생성 실패: ${msg}` }, { status: 500 })
      }

      const { data: newUser, error: insertError } = await adminSupabase
        .from('users')
        .insert({
          auth_id: authId,
          role: 'customer',
          name: name.trim(),
          phone: normalizedPhone,
          is_active: true,
        })
        .select('id')
        .single()

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
      userId = newUser!.id
    }

    // customers 테이블의 user_id 연결
    await adminSupabase.from('customers').update({ user_id: userId }).eq('id', customer_id)

    return NextResponse.json({ success: true })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
