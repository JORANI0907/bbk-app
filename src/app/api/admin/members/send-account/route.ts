import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendAlimtalk, sendSMS } from '@/lib/solapi'
import { sendSlack } from '@/lib/slack'

// Solapi 카카오 알림톡 템플릿 ID — 변경 시 이 값만 수정
const TEMPLATE_ID = 'KA01TP260515182858932rdNwPSJALBo'

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json()
    if (!userId) return NextResponse.json({ error: 'userId가 필요합니다.' }, { status: 400 })

    const supabase = createServiceClient()
    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, phone, role, auth_id, password_hint')
      .eq('id', userId)
      .single()

    if (error || !user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 })
    }

    const phone = (user.phone ?? '').replace(/-/g, '')
    if (!phone) return NextResponse.json({ error: '전화번호가 없습니다.' }, { status: 400 })

    const loginId = phone
    const loginPw = user.password_hint ?? (user.role === 'customer' ? phone : `${phone}bbk`)
    const smsText = `[BBK 공간케어] ${user.name}님, 계정 정보를 안내드립니다.\nID: ${loginId}\nPW: ${loginPw}\n앱 설치: https://app.bbkorea.co.kr/install\n문의: 031-759-4877`

    // 알림톡 시도 → 실패 시 SMS 폴백
    let channel = '알림톡'
    try {
      await sendAlimtalk(
        phone,
        TEMPLATE_ID,
        { '#{고객명}': user.name, '#{아이디}': loginId, '#{비밀번호}': loginPw },
        smsText,
      )
    } catch (alimtalkErr) {
      console.warn('알림톡 발송 실패, SMS 폴백:', alimtalkErr instanceof Error ? alimtalkErr.message : alimtalkErr)
      await sendSMS(phone, smsText)
      channel = 'SMS'
    }

    await sendSlack(
      `📨 *계정 발송 완료* (${channel})\n${user.name} (${phone})\nID: ${loginId}\nPW: ${loginPw}`,
    )

    await supabase
      .from('users')
      .update({ account_sent_at: new Date().toISOString() })
      .eq('id', userId)

    return NextResponse.json({ success: true, channel })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
