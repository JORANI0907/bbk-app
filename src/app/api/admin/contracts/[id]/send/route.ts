import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendByTemplate } from '@/lib/template-sender'
import { sendHtmlEmail } from '@/lib/email'
import { buildSignRequestEmail, resolveSendTarget } from '@/lib/contract-send'
import type { NotificationContext } from '@/lib/notification-variables'

const SIGN_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://bbk-app.vercel.app'
const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000

type RouteParams = { params: { id: string } }
type EmailOutcome = 'sent' | 'skipped' | 'failed'

interface CustomerRow { id: string; business_name: string; contact_name: string | null; email: string | null }

/**
 * POST /api/admin/contracts/[id]/send — 고객에게 서명 링크 발송 (문자 필수 + 이메일 선택)
 *
 * body: { phone?: string; email?: string }
 *   - 관리자가 발송 모달에서 확인·수정한 값. 비어 있으면 계약서(연락처)·고객(이메일)에 저장된 값을 쓴다.
 *   - 휴대폰은 계약서 customer_phone 에 저장된다. 인증번호(OTP)도 이 번호로만 가므로 링크를 받은
 *     번호와 인증번호를 받는 번호가 항상 같다.
 *   - 이메일은 계약서 customer_email 에 저장되고, 고객 이메일이 비어 있으면 거기에도 채운다.
 *   - 문자 실패는 전체 실패. 이메일 실패는 문자만 성공으로 처리하고 결과에 표시한다.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const supabase = createServiceClient()

  const { data: contract, error: fetchError } = await supabase
    .from('contracts')
    .select('id, signing_status, signing_token, customer_phone, customer_email, customer_id, customers(id, business_name, contact_name, email)')
    .eq('id', params.id)
    .single()

  if (fetchError || !contract) {
    return NextResponse.json({ success: false, error: '계약서를 찾을 수 없습니다.' }, { status: 404 })
  }

  if (!['draft', 'pending_customer'].includes(contract.signing_status as string)) {
    return NextResponse.json(
      { success: false, error: '서명 요청을 보낼 수 없는 상태입니다. (이미 서명되었거나 파기된 계약서)' },
      { status: 400 },
    )
  }

  const customer = contract.customers as unknown as CustomerRow | null
  const body = await request.json().catch(() => ({})) as { phone?: string; email?: string }
  const target = resolveSendTarget({
    phone: body.phone ?? (contract.customer_phone as string | null),
    email: body.email !== undefined ? body.email : ((contract.customer_email as string | null) ?? customer?.email),
  })
  if (!target.ok) {
    return NextResponse.json({ success: false, error: target.error }, { status: 400 })
  }

  const token = contract.signing_token as string
  const tokenExpiresAt = new Date(Date.now() + LINK_TTL_MS).toISOString()

  // 발송 대상·상태 저장 (링크를 받은 번호 = 인증번호 받는 번호)
  const { error: updateError } = await supabase
    .from('contracts')
    .update({
      signing_status: 'pending_customer',
      token_expires_at: tokenExpiresAt,
      customer_phone: target.phone,
      customer_email: target.email,
    })
    .eq('id', params.id)

  if (updateError) {
    return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
  }

  // 고객 이메일이 비어 있으면 고객관리에도 채운다 (이미 다른 주소가 있으면 건드리지 않는다)
  if (target.email && customer && !customer.email) {
    const { error } = await supabase.from('customers').update({ email: target.email }).eq('id', customer.id)
    if (error) console.error('[CONTRACT_SEND] 고객 이메일 보강 실패:', error.message)
  }

  const signUrl = `${SIGN_BASE_URL}/sign/${token}`
  const recipientName = customer?.contact_name ?? customer?.business_name ?? null
  const smsContext: NotificationContext = {
    customer: { business_name: customer?.business_name ?? null, contact_name: customer?.contact_name ?? null },
    extra: { contract_pdf_url: signUrl },
  }

  const result = await sendByTemplate('CONTRACT_SEND', target.phone, smsContext)

  if (!result.ok) {
    const errorMsg = result.details ? `${result.reason}: ${result.details}` : result.reason
    console.error('[CONTRACT_SEND] SMS 발송 실패', { contractId: params.id, phone: target.phone, reason: result.reason, details: result.details })
    await supabase.from('notification_history').insert({
      category: 'sms', type: '계약서서명링크', method: 'manual',
      recipient_phone: target.phone, recipient_name: recipientName,
      status: 'failed', error_message: errorMsg,
      metadata: { contract_id: params.id, template_code: 'CONTRACT_SEND' },
    })
    return NextResponse.json(
      { success: false, error: `SMS 발송 실패 (${result.reason})${result.details ? ` — ${result.details}` : ''}` },
      { status: 500 },
    )
  }

  await supabase.from('notification_history').insert({
    category: 'sms', type: '계약서서명링크', method: 'manual',
    recipient_phone: target.phone, recipient_name: recipientName,
    body: result.text, status: 'sent',
    metadata: { contract_id: params.id, template_id: result.templateId, sms_type: result.type },
  })

  const { email, emailError } = await sendSignEmail({
    supabase, contractId: params.id, to: target.email, recipientName,
    businessName: customer?.business_name ?? '', contactName: customer?.contact_name ?? null,
    signUrl, phone: target.phone, expiresAt: tokenExpiresAt,
  })

  return NextResponse.json({ success: true, sms: 'sent', email, emailError, phone: target.phone, emailTo: target.email })
}

async function sendSignEmail(opts: {
  supabase: ReturnType<typeof createServiceClient>
  contractId: string
  to: string | null
  recipientName: string | null
  businessName: string
  contactName: string | null
  signUrl: string
  phone: string
  expiresAt: string
}): Promise<{ email: EmailOutcome; emailError: string | null }> {
  if (!opts.to) return { email: 'skipped', emailError: null }

  const mail = buildSignRequestEmail({
    businessName: opts.businessName, contactName: opts.contactName,
    signUrl: opts.signUrl, phone: opts.phone, expiresAt: opts.expiresAt,
  })
  const base = {
    category: 'email', type: '계약서서명링크', method: 'manual',
    recipient_name: opts.recipientName, title: mail.subject,
    metadata: { contract_id: opts.contractId, recipient_email: opts.to },
  }
  try {
    await sendHtmlEmail({ toEmail: opts.to, subject: mail.subject, html: mail.html, text: mail.text, fromName: '범빌드코리아' })
    await opts.supabase.from('notification_history').insert({ ...base, body: mail.text, status: 'sent' })
    return { email: 'sent', emailError: null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[CONTRACT_SEND] 이메일 발송 실패', { contractId: opts.contractId, to: opts.to, msg })
    await opts.supabase.from('notification_history').insert({ ...base, status: 'failed', error_message: msg })
    return { email: 'failed', emailError: msg }
  }
}
