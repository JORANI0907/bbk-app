import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { otpStore } from '@/lib/otp-store'
import { sendOTP } from '@/lib/solapi'

type RouteParams = { params: { token: string } }

/**
 * POST /api/worker-documents/[token]/send-otp
 * 직원이 업로드 페이지에서 "인증번호 발송" 클릭 시 호출.
 * OTP 는 서버가 생성하고 등록된 otp_phone 으로만 발송 (직원이 임의 번호 입력 불가).
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const supabase = createServiceClient()

  const { data: reqData, error } = await supabase
    .from('worker_document_requests')
    .select('id, status, token_expires_at, otp_phone')
    .eq('token', params.token)
    .single()

  if (error || !reqData) {
    return NextResponse.json({ success: false, error: '유효하지 않은 링크입니다.' }, { status: 404 })
  }

  if (new Date(reqData.token_expires_at as string) < new Date()) {
    return NextResponse.json({ success: false, error: '링크가 만료되었습니다.' }, { status: 410 })
  }

  if (reqData.status === 'submitted') {
    return NextResponse.json({ success: false, error: '이미 제출이 완료된 요청입니다.' }, { status: 409 })
  }

  const phone = (reqData.otp_phone as string).replace(/-/g, '')

  // Rate limit 체크
  const rateLimitSecs = otpStore.isRateLimited(phone)
  if (rateLimitSecs > 0) {
    return NextResponse.json(
      { success: false, error: `${rateLimitSecs}초 후에 다시 요청해주세요.` },
      { status: 429 },
    )
  }
  const lockMins = otpStore.isLocked(phone)
  if (lockMins > 0) {
    return NextResponse.json(
      { success: false, error: `${lockMins}분 후에 다시 시도해주세요.` },
      { status: 429 },
    )
  }

  // 6자리 OTP 생성
  const otp = String(Math.floor(100000 + Math.random() * 900000))
  const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

  otpStore.save(phone, otp)

  await supabase
    .from('worker_document_requests')
    .update({ otp_code: otp, otp_expires_at: otpExpiresAt })
    .eq('id', reqData.id as string)

  try {
    await sendOTP(phone, otp)
  } catch (smsError) {
    const errMsg = smsError instanceof Error ? smsError.message : String(smsError)
    console.error('[worker-documents/send-otp] SMS 실패', { requestId: reqData.id, error: errMsg })
    await supabase.from('notification_history').insert({
      category: 'sms',
      type: '직원서류OTP',
      method: 'auto',
      recipient_phone: phone,
      status: 'failed',
      error_message: errMsg,
      metadata: { request_id: reqData.id, purpose: 'worker_documents_otp' },
    })
    return NextResponse.json(
      { success: false, error: `SMS 발송에 실패했습니다: ${errMsg}` },
      { status: 500 },
    )
  }

  await supabase.from('notification_history').insert({
    category: 'sms',
    type: '직원서류OTP',
    method: 'auto',
    recipient_phone: phone,
    status: 'sent',
    metadata: { request_id: reqData.id, purpose: 'worker_documents_otp' },
  })

  return NextResponse.json({ success: true, message: '인증번호가 발송되었습니다.' })
}
