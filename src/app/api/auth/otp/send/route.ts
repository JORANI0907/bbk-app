import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendOTP } from '@/lib/solapi'
import { otpStore } from '@/lib/otp-store'
import crypto from 'crypto'

function generateOTP(): string {
  return crypto.randomInt(100000, 999999).toString()
}

export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json()

    if (!phone || !/^(010|011|016|017|018|019)\d{7,8}$/.test(phone.replace(/-/g, ''))) {
      return NextResponse.json({ error: '올바른 전화번호를 입력해주세요.' }, { status: 400 })
    }

    const normalizedPhone = phone.replace(/-/g, '')

    // 레이트 리밋 확인 (60초)
    const rateLimitSecs = otpStore.isRateLimited(normalizedPhone)
    if (rateLimitSecs > 0) {
      return NextResponse.json(
        { error: `${rateLimitSecs}초 후에 다시 시도해주세요.` },
        { status: 429 }
      )
    }

    // 사용자 존재 확인
    const supabase = createServiceClient()
    const { data: user } = await supabase
      .from('users')
      .select('id, role, name')
      .eq('phone', normalizedPhone)
      .single()

    if (!user) {
      return NextResponse.json({ error: '등록되지 않은 전화번호입니다.' }, { status: 404 })
    }

    // OTP 생성 및 저장
    const otp = generateOTP()
    otpStore.save(normalizedPhone, otp)

    // SMS 발송
    await sendOTP(normalizedPhone, otp)

    return NextResponse.json({ success: true, message: 'OTP가 발송되었습니다.' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('OTP 발송 오류:', message)
    return NextResponse.json({ error: `OTP 발송 실패: ${message}` }, { status: 500 })
  }
}
