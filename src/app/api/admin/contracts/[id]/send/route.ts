import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSMS } from '@/lib/solapi'

const SIGN_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://bbk-app.vercel.app'

type RouteParams = { params: { id: string } }

// POST /api/admin/contracts/[id]/send — 고객에게 서명 링크 SMS 발송
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const supabase = createServiceClient()

  const { data: contract, error: fetchError } = await supabase
    .from('contracts')
    .select('id, signing_status, signing_token, customer_phone, customers(business_name, contact_name)')
    .eq('id', params.id)
    .single()

  if (fetchError || !contract) {
    return NextResponse.json({ success: false, error: '계약서를 찾을 수 없습니다.' }, { status: 404 })
  }

  if (!['draft', 'pending_customer'].includes(contract.signing_status as string)) {
    return NextResponse.json(
      { success: false, error: '서명 요청을 보낼 수 없는 상태입니다.' },
      { status: 400 },
    )
  }

  const phone = contract.customer_phone as string | null
  if (!phone) {
    return NextResponse.json({ success: false, error: '고객 전화번호가 없습니다.' }, { status: 400 })
  }

  const token = contract.signing_token as string
  const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  // 상태 업데이트
  const { error: updateError } = await supabase
    .from('contracts')
    .update({
      signing_status: 'pending_customer',
      token_expires_at: tokenExpiresAt,
    })
    .eq('id', params.id)

  if (updateError) {
    return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
  }

  const smsText =
    `[BBK 공간케어] 계약서 서명 요청\n` +
    `아래 링크에서 계약 내용을 확인하고 서명해주세요.\n` +
    `${SIGN_BASE_URL}/sign/${token}\n` +
    `링크 유효기간: 7일`

  try {
    await sendSMS(phone, smsText)
  } catch (smsError) {
    // SMS 실패해도 상태는 이미 변경됨 — 오류만 알림
    return NextResponse.json(
      { success: false, error: `SMS 발송 실패: ${(smsError as Error).message}` },
      { status: 500 },
    )
  }

  return NextResponse.json({ success: true, message: 'SMS가 발송되었습니다.' })
}
