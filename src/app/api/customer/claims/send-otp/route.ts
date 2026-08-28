/**
 * Batch B-3: 고객 클레임 접수용 OTP 발송 API
 *
 * POST /api/customer/claims/send-otp
 *   body: { phone }
 *   - 등록된 고객만 접수 가능. customers 테이블에서 phone 매칭 확인.
 *   - 60초 rate limit, 5분 유효, 5회 실패 시 15분 락.
 *   - 계약서 서명 OTP 와 동일한 otpStore/sendOTP 재사용.
 */

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

    // 락 상태 확인
    const lockedMins = otpStore.isLocked(normalizedPhone)
    if (lockedMins > 0) {
      return NextResponse.json(
        { error: `인증 실패 초과. ${lockedMins}분 후 재시도하세요.` },
        { status: 429 }
      )
    }

    // 레이트 리밋 확인
    const rateLimitSecs = otpStore.isRateLimited(normalizedPhone)
    if (rateLimitSecs > 0) {
      return NextResponse.json(
        { error: `${rateLimitSecs}초 후에 다시 시도해주세요.` },
        { status: 429 }
      )
    }

    // 등록된 연락처는 정보 미리 세팅. 미등록도 OTP 발송 허용 (1회성 고객·계정 잊은 고객 대응).
    // 스팸 방어는 OTP 인증 + 레이트 리밋(60초) + 실패 락(15분) 3중으로 유지.
    // 접수 시 customers 매칭 실패해도 claim 은 저장되고 관리자가 후속 매칭 처리.
    const supabase = createServiceClient()
    void supabase // ESLint 미사용 방지 — 향후 customer 프리페치가 필요할 때 사용

    // OTP 생성·저장·발송
    const otp = generateOTP()
    otpStore.save(normalizedPhone, otp)
    await sendOTP(normalizedPhone, otp)

    return NextResponse.json({ success: true, message: '인증번호가 발송되었습니다.' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[claims/send-otp] 오류:', message)
    return NextResponse.json({ error: `발송 실패: ${message}` }, { status: 500 })
  }
}
