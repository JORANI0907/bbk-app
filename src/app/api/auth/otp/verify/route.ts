import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { otpStore } from '@/lib/otp-store'
import crypto from 'crypto'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

function derivePassword(phone: string): string {
  return crypto
    .createHmac('sha256', SERVICE_KEY)
    .update(`bbk:${phone}`)
    .digest('hex')
}

// Supabase Auth REST API: 사용자 생성
async function createAuthUser(email: string, password: string, metadata: object) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message ?? data.error ?? '사용자 생성 실패')
  return data
}

// Supabase Auth REST API: 이메일+비밀번호 로그인 → 세션 반환
async function signInWithPassword(email: string, password: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
    },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description ?? data.error ?? '로그인 실패')
  return data
}

export async function POST(request: NextRequest) {
  try {
    const { phone, otp } = await request.json()

    if (!phone || !otp) {
      return NextResponse.json({ error: '전화번호와 인증번호를 입력해주세요.' }, { status: 400 })
    }

    const normalizedPhone = phone.replace(/-/g, '')

    // 잠금 확인
    const lockMins = otpStore.isLocked(normalizedPhone)
    if (lockMins > 0) {
      return NextResponse.json(
        { error: `너무 많이 시도했습니다. ${lockMins}분 후에 다시 시도해주세요.` },
        { status: 429 }
      )
    }

    // OTP 검증
    const result = otpStore.verify(normalizedPhone, otp)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    // BBK users 테이블 조회
    const adminSupabase = createServiceClient()
    const { data: user, error: userError } = await adminSupabase
      .from('users')
      .select('id, role, name, auth_id, phone')
      .eq('phone', normalizedPhone)
      .single()

    if (userError || !user) {
      console.error('users 조회 오류:', userError?.message)
      return NextResponse.json({ error: '등록되지 않은 전화번호입니다.' }, { status: 404 })
    }

    const email = `${normalizedPhone}@bbkorea.app`
    const password = derivePassword(normalizedPhone)

    // Supabase Auth 계정이 없으면 생성
    if (!user.auth_id) {
      console.log('신규 Auth 계정 생성:', email)
      try {
        const authUser = await createAuthUser(email, password, {
          role: user.role,
          name: user.name,
          bbk_user_id: user.id,
        })
        await adminSupabase
          .from('users')
          .update({ auth_id: authUser.id })
          .eq('id', user.id)
        console.log('Auth 계정 생성 완료:', authUser.id)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        // 이미 존재하는 경우 무시
        if (!msg.includes('already')) {
          console.error('Auth 계정 생성 실패:', msg)
          return NextResponse.json({ error: `계정 생성 실패: ${msg}` }, { status: 500 })
        }
        console.log('Auth 계정 이미 존재, 로그인 시도')
      }
    }

    // 로그인 → 세션 획득
    console.log('로그인 시도:', email)
    const session = await signInWithPassword(email, password)
    console.log('로그인 성공')

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
    console.error('OTP 검증 오류:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
