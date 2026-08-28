/**
 * A/S 요청 접수용 OTP 확인 API (접수 API와 분리)
 * POST /api/customer/claims/verify-otp
 *   body: { phone, otp }
 *   - OTP 검증 성공 시 phone 을 verified 상태로 마킹 (30분 유효)
 *   - 이후 접수 API 는 otp 없이 verified 상태만 확인
 *   - 목적: 사용자가 OTP 만료(5분) 압박 없이 상세 내용을 여유 있게 입력
 */

import { NextRequest, NextResponse } from 'next/server'
import { otpStore } from '@/lib/otp-store'

export async function POST(request: NextRequest) {
  try {
    const { phone, otp } = await request.json()

    if (!phone || !otp) {
      return NextResponse.json({ error: '연락처와 인증번호가 필요합니다.' }, { status: 400 })
    }

    const normalizedPhone = String(phone).replace(/-/g, '')

    const verify = otpStore.verify(normalizedPhone, String(otp).trim())
    if (!verify.success) {
      return NextResponse.json({ error: verify.error ?? '인증 실패' }, { status: 401 })
    }

    // 인증 통과 → 30분 유효 상태로 마킹. 접수 API 에서 consumeVerified() 로 소비.
    otpStore.markVerified(normalizedPhone)
    return NextResponse.json({ success: true, valid_for_seconds: 30 * 60 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: `인증 실패: ${message}` }, { status: 500 })
  }
}
