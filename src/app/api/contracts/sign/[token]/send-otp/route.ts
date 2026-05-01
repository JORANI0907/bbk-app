import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { otpStore } from '@/lib/otp-store'
import { sendOTP } from '@/lib/solapi'

type RouteParams = { params: { token: string } }

// POST /api/contracts/sign/[token]/send-otp
export async function POST(request: NextRequest, { params }: RouteParams) {
  const supabase = createServiceClient()

  // 토큰 유효성 확인
  const { data: contract, error } = await supabase
    .from('contracts')
    .select('id, signing_status, token_expires_at, customer_phone')
    .eq('signing_token', params.token)
    .single()

  if (error || !contract) {
    return NextResponse.json({ success: false, error: '유효하지 않은 링크입니다.' }, { status: 404 })
  }

  if (new Date(contract.token_expires_at as string) < new Date()) {
    return NextResponse.json({ success: false, error: '링크가 만료되었습니다.' }, { status: 410 })
  }

  if (!['pending_customer', 'customer_signed'].includes(contract.signing_status as string)) {
    return NextResponse.json({ success: false, error: '서명할 수 없는 상태입니다.' }, { status: 400 })
  }

  let body: { phone?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 형식입니다.' }, { status: 400 })
  }

  const { phone } = body
  if (!phone) {
    return NextResponse.json({ success: false, error: '전화번호는 필수입니다.' }, { status: 400 })
  }

  const normalizedPhone = phone.replace(/-/g, '')

  // Rate limit 체크
  const rateLimitSecs = otpStore.isRateLimited(normalizedPhone)
  if (rateLimitSecs > 0) {
    return NextResponse.json(
      { success: false, error: `${rateLimitSecs}초 후에 다시 요청해주세요.` },
      { status: 429 },
    )
  }

  // 잠금 체크
  const lockMins = otpStore.isLocked(normalizedPhone)
  if (lockMins > 0) {
    return NextResponse.json(
      { success: false, error: `${lockMins}분 후에 다시 시도해주세요.` },
      { status: 429 },
    )
  }

  // 6자리 OTP 생성
  const otp = String(Math.floor(100000 + Math.random() * 900000))
  const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

  // 인메모리 저장
  otpStore.save(normalizedPhone, otp)

  // DB에도 저장 (서버리스 재시작 대비)
  await supabase
    .from('contracts')
    .update({
      otp_code: otp,
      otp_expires_at: otpExpiresAt,
    })
    .eq('id', contract.id as string)

  // OTP 발송
  try {
    await sendOTP(normalizedPhone, otp)
  } catch (smsError) {
    return NextResponse.json(
      { success: false, error: `SMS 발송에 실패했습니다: ${(smsError as Error).message}` },
      { status: 500 },
    )
  }

  return NextResponse.json({ success: true, message: '인증번호가 발송되었습니다.' })
}
