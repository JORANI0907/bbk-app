import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendByTemplate } from '@/lib/template-sender'
import type { NotificationContext } from '@/lib/notification-variables'

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

  const customers = contract.customers as unknown as { business_name: string; contact_name: string | null } | null
  const smsContext: NotificationContext = {
    customer: {
      business_name: customers?.business_name ?? null,
      contact_name: customers?.contact_name ?? null,
    },
    extra: {
      contract_pdf_url: `${SIGN_BASE_URL}/sign/${token}`,
    },
  }

  const normalizedPhone = phone.replace(/-/g, '')
  const result = await sendByTemplate('CONTRACT_SEND', normalizedPhone, smsContext)

  if (!result.ok) {
    // 실패 로그 남기기 (진단·감사용)
    const errorMsg = result.details ? `${result.reason}: ${result.details}` : result.reason
    console.error('[CONTRACT_SEND] SMS 발송 실패', {
      contractId: params.id,
      phone: normalizedPhone,
      reason: result.reason,
      details: result.details,
    })
    await supabase.from('notification_history').insert({
      category: 'sms',
      type: '계약서서명링크',
      method: 'manual',
      recipient_phone: normalizedPhone,
      recipient_name: customers?.contact_name ?? customers?.business_name ?? null,
      status: 'failed',
      error_message: errorMsg,
      metadata: { contract_id: params.id, template_code: 'CONTRACT_SEND' },
    })

    return NextResponse.json(
      {
        success: false,
        error: `SMS 발송 실패 (${result.reason})${result.details ? ` — ${result.details}` : ''}`,
      },
      { status: 500 },
    )
  }

  // 성공 로그
  await supabase.from('notification_history').insert({
    category: 'sms',
    type: '계약서서명링크',
    method: 'manual',
    recipient_phone: normalizedPhone,
    recipient_name: customers?.contact_name ?? customers?.business_name ?? null,
    body: result.text,
    status: 'sent',
    metadata: { contract_id: params.id, template_id: result.templateId, sms_type: result.type },
  })

  return NextResponse.json({ success: true, message: 'SMS가 발송되었습니다.' })
}
