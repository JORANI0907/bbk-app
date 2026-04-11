import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendAlimtalk } from '@/lib/solapi'
import { sendSlack } from '@/lib/slack'

const TEMPLATE_ID = 'KA01TP260404141110684azipFQYSyxX'

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json()
    if (!userId) return NextResponse.json({ error: 'userId가 필요합니다.' }, { status: 400 })

    const supabase = createServiceClient()
    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, phone, email, role, auth_id')
      .eq('id', userId)
      .single()

    if (error || !user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 })
    }

    const phone = (user.phone ?? '').replace(/-/g, '')
    if (!phone) return NextResponse.json({ error: '전화번호가 없습니다.' }, { status: 400 })

    // 로그인 ID는 이메일 또는 전화번호@bbkorea.app
    const loginId = user.email ?? `${phone}@bbkorea.app`
    const loginPw = phone  // 초기 비밀번호는 전화번호

    const fallbackText = `[BBK 공간케어] ${user.name}님, 계정 정보를 안내드립니다.\nID: ${loginId}\nPW: ${loginPw}\n문의: 031-759-4877`

    await sendAlimtalk(
      phone,
      TEMPLATE_ID,
      { '#{이름}': user.name, '#{아이디}': loginId, '#{비밀번호}': loginPw },
      fallbackText,
    )

    await sendSlack(
      `📨 *계정 발송 완료*\n직원: ${user.name} (${phone})\nID: ${loginId}\nPW: ${loginPw}`,
    )

    return NextResponse.json({ success: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
