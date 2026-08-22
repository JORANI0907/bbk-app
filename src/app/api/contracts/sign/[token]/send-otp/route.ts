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

  // 요청 body 는 무시. OTP 수신 번호는 계약서 생성 시 관리자가 등록한
  // contract.customer_phone 을 강제 사용한다 (다른 번호로 OTP 받는 것 방지).
  try {
    await request.json().catch(() => ({}))
  } catch {
    // body 없어도 통과 (더 이상 phone 을 body 에서 받지 않음)
  }

  const registeredPhone = contract.customer_phone as string | null
  if (!registeredPhone) {
    return NextResponse.json(
      { success: false, error: '계약서에 OTP 수신 연락처가 등록되어 있지 않습니다. 관리자에게 문의해주세요.' },
      { status: 400 },
    )
  }

  const normalizedPhone = registeredPhone.replace(/-/g, '')

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
    const errMsg = smsError instanceof Error ? smsError.message : String(smsError)
    console.error('[CONTRACT_OTP] SMS 발송 실패', {
      contractId: contract.id,
      phone: normalizedPhone,
      error: errMsg,
    })
    await supabase.from('notification_history').insert({
      category: 'sms',
      type: '계약서OTP',
      method: 'auto',
      recipient_phone: normalizedPhone,
      status: 'failed',
      error_message: errMsg,
      metadata: { contract_id: contract.id, purpose: 'contract_sign_otp' },
    })
    return NextResponse.json(
      { success: false, error: `SMS 발송에 실패했습니다: ${errMsg}` },
      { status: 500 },
    )
  }

  // 성공 로그 (본문은 OTP 노출 방지를 위해 제외)
  await supabase.from('notification_history').insert({
    category: 'sms',
    type: '계약서OTP',
    method: 'auto',
    recipient_phone: normalizedPhone,
    status: 'sent',
    metadata: { contract_id: contract.id, purpose: 'contract_sign_otp' },
  })

  return NextResponse.json({ success: true, message: '인증번호가 발송되었습니다.' })
}
