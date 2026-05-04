import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { otpStore } from '@/lib/otp-store'
import { sendSlack } from '@/lib/slack'

type RouteParams = { params: { token: string } }

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  )
}

// POST /api/contracts/sign/[token]/agree — 고객 OTP 검증 + 동의 기록
export async function POST(request: NextRequest, { params }: RouteParams) {
  const supabase = createServiceClient()

  const { data: contract, error } = await supabase
    .from('contracts')
    .select('id, signing_status, token_expires_at, otp_code, otp_expires_at, subscription_plan, customers(business_name, contact_name)')
    .eq('signing_token', params.token)
    .single()

  if (error || !contract) {
    return NextResponse.json({ success: false, error: '유효하지 않은 링크입니다.' }, { status: 404 })
  }

  if (new Date(contract.token_expires_at as string) < new Date()) {
    return NextResponse.json({ success: false, error: '링크가 만료되었습니다.' }, { status: 410 })
  }

  if (contract.signing_status !== 'pending_customer') {
    return NextResponse.json(
      { success: false, error: '이미 서명이 완료된 계약서입니다.' },
      { status: 409 },
    )
  }

  let body: { phone?: string; otp?: string; article8Agree?: boolean; article14Agree?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 형식입니다.' }, { status: 400 })
  }

  const { phone, otp, article8Agree, article14Agree } = body

  if (!phone || !otp) {
    return NextResponse.json({ success: false, error: '전화번호와 인증번호는 필수입니다.' }, { status: 400 })
  }

  if (!article8Agree || !article14Agree) {
    return NextResponse.json({ success: false, error: '모든 조항에 동의해야 합니다.' }, { status: 400 })
  }

  const normalizedPhone = phone.replace(/-/g, '')

  // OTP 검증: 인메모리 먼저, 없으면 DB fallback
  let otpValid = false
  const memResult = otpStore.verify(normalizedPhone, otp)

  if (memResult.success) {
    otpValid = true
  } else {
    // DB fallback (서버리스 재시작으로 인메모리 소실 시)
    const dbOtp = contract.otp_code as string | null
    const dbExpires = contract.otp_expires_at as string | null
    if (dbOtp && dbExpires && dbOtp === otp && new Date(dbExpires) > new Date()) {
      otpValid = true
    }
  }

  if (!otpValid) {
    return NextResponse.json(
      { success: false, error: memResult.error ?? '인증번호가 올바르지 않습니다.' },
      { status: 400 },
    )
  }

  const clientIp = getClientIp(request)
  const now = new Date().toISOString()

  const { error: updateError } = await supabase
    .from('contracts')
    .update({
      signing_status: 'customer_signed',
      customer_agreed_at: now,
      customer_ip: clientIp,
      article8_agree: true,
      article14_agree: true,
      // OTP 정리
      otp_code: null,
      otp_expires_at: null,
    })
    .eq('id', contract.id as string)

  if (updateError) {
    return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
  }

  // Slack 알림
  const customer = contract.customers as { business_name?: string; contact_name?: string } | null
  const businessName = customer?.business_name ?? '고객'
  const servicePlan = contract.subscription_plan as string ?? ''

  await sendSlack(
    `✅ *계약서 고객 서명 완료* | ${businessName} | ${servicePlan}`,
  )

  return NextResponse.json({
    success: true,
    message: '계약서 서명이 완료되었습니다. 담당자가 최종 확인 후 계약이 성립됩니다.',
  })
}
