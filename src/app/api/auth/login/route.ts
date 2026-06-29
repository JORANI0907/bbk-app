import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { signInWithPassword, customerEmail, staffEmail, franchiseEmail } from '@/lib/auth-helpers'
import { sendSlack } from '@/lib/slack'
import { recordLoginLog } from '@/lib/login-log'

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown'

  try {
    const { phone, password } = await request.json()

    if (!phone?.trim() || !password?.trim()) {
      return NextResponse.json({ error: '아이디와 비밀번호를 입력해주세요.' }, { status: 400 })
    }

    // 입력값에서 @, - 제거해서 전화번호만 추출
    const normalized = phone.trim().replace(/@.*$/, '').replace(/-/g, '')

    const supabase = createServiceClient()

    // users 테이블에서 phone으로 role 조회 (is_active 포함)
    const { data: userRow, error: userLookupError } = await supabase
      .from('users')
      .select('id, role, name, is_active')
      .eq('phone', normalized)
      .single()

    if (userLookupError || !userRow) {
      return NextResponse.json({ error: '등록되지 않은 계정입니다.' }, { status: 404 })
    }

    if (!userRow.is_active) {
      return NextResponse.json({ error: '비활성화된 계정입니다. 관리자에게 문의하세요.' }, { status: 403 })
    }

    // role에 따라 가상이메일 결정
    const email = userRow.role === 'customer'
      ? customerEmail(normalized)
      : userRow.role === 'franchise_hq'
        ? franchiseEmail(normalized)
        : staffEmail(normalized)

    let session
    try {
      session = await signInWithPassword(email, password)
    } catch (authError) {
      const authMsg = authError instanceof Error ? authError.message : String(authError)
      if (authMsg.includes('Invalid login credentials')) {
        recordLoginLog(userRow.id, userRow.role, false, ip, '비밀번호 오류').catch(() => {})
        return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 })
      }
      throw authError
    }

    recordLoginLog(userRow.id, userRow.role, true, ip).catch(() => {})

    if (userRow.role === 'admin' || userRow.role === 'worker') {
      sendSlack(`[로그인] ${userRow.name} (${userRow.role})`).catch(() => {})
    }

    // franchise_hq는 franchise_hq.id를 세션에 포함시키기 위해 함께 반환
    let franchiseHqId: string | undefined
    if (userRow.role === 'franchise_hq') {
      const { data: hq } = await supabase
        .from('franchise_hq')
        .select('id')
        .eq('user_id', userRow.id)
        .single()
      if (!hq) {
        return NextResponse.json({ error: '본사 정보가 설정되어 있지 않습니다.' }, { status: 404 })
      }
      franchiseHqId = hq.id
    }

    return NextResponse.json({
      success: true,
      user: {
        id: userRow.id,
        role: userRow.role,
        name: userRow.name,
        ...(franchiseHqId ? { franchiseHqId } : {}),
      },
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
