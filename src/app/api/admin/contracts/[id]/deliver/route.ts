import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendByTemplate } from '@/lib/template-sender'
import { sendHtmlEmail, type EmailAttachment } from '@/lib/email'
import { buildContractDeliveryEmail, contractPdfFileName, resolveSendTarget } from '@/lib/contract-send'
import type { NotificationContext } from '@/lib/notification-variables'

type RouteParams = { params: { id: string } }
type EmailOutcome = 'sent' | 'skipped' | 'failed'
type Supabase = ReturnType<typeof createServiceClient>

interface CustomerRow { id: string; business_name: string; contact_name: string | null; email: string | null }

const HISTORY_TYPE = '계약서발송'

/**
 * POST /api/admin/contracts/[id]/deliver — 서명이 모두 끝난 계약서를 고객에게 발송 (문자 필수 + 이메일 선택)
 *
 * body: { phone?: string; email?: string }
 *   - 관리자가 발송 모달에서 확인·수정한 값. 비어 있으면 계약서(연락처)·고객(이메일)에 저장된 값을 쓴다.
 *   - 문자: CONTRACT_COMPLETE 템플릿(문자알림관리에서 수정 가능)에 PDF 링크(signed_pdf_url)를 넣어 보낸다.
 *   - 이메일: Storage 의 서명 완료 PDF 를 첨부하고 같은 링크도 본문에 넣는다. PDF 를 못 읽으면 링크만 보낸다.
 *   - 완료된 계약서의 연락처(customer_phone)는 바꾸지 않는다. 이메일은 계약서·고객 정보가 비어 있을 때만 채운다.
 *   - 문자 실패는 전체 실패. 이메일 실패는 문자만 성공으로 처리하고 결과에 표시한다.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const supabase = createServiceClient()

  const { data: contract, error: fetchError } = await supabase
    .from('contracts')
    .select('id, signing_status, signed_pdf_url, admin_signed_at, customer_phone, customer_email, customers(id, business_name, contact_name, email)')
    .eq('id', params.id)
    .is('deleted_at', null)
    .single()

  if (fetchError || !contract) {
    return NextResponse.json({ success: false, error: '계약서를 찾을 수 없습니다.' }, { status: 404 })
  }
  if (contract.signing_status !== 'completed') {
    return NextResponse.json({ success: false, error: '서명이 모두 완료된 계약서만 발송할 수 있습니다.' }, { status: 400 })
  }
  const pdfUrl = contract.signed_pdf_url as string | null
  if (!pdfUrl) {
    return NextResponse.json({ success: false, error: '계약서 PDF 가 없어 발송할 수 없습니다.' }, { status: 400 })
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

  await backfillEmail(supabase, params.id, contract.customer_email as string | null, customer, target.email)

  const businessName = customer?.business_name ?? ''
  const recipientName = customer?.contact_name ?? customer?.business_name ?? null
  const smsContext: NotificationContext = {
    customer: { business_name: businessName || null, contact_name: customer?.contact_name ?? null },
    extra: { contract_pdf_url: pdfUrl },
  }
  const sms = await sendByTemplate('CONTRACT_COMPLETE', target.phone, smsContext)

  if (!sms.ok) {
    const errorMsg = sms.details ? `${sms.reason}: ${sms.details}` : sms.reason
    console.error('[CONTRACT_DELIVER] SMS 발송 실패', { contractId: params.id, phone: target.phone, reason: sms.reason, details: sms.details })
    await supabase.from('notification_history').insert({
      category: 'sms', type: HISTORY_TYPE, method: 'manual',
      recipient_phone: target.phone, recipient_name: recipientName,
      status: 'failed', error_message: errorMsg,
      metadata: { contract_id: params.id, template_code: 'CONTRACT_COMPLETE' },
    })
    return NextResponse.json(
      { success: false, error: `SMS 발송 실패 (${sms.reason})${sms.details ? ` — ${sms.details}` : ''}` },
      { status: 500 },
    )
  }

  await supabase.from('notification_history').insert({
    category: 'sms', type: HISTORY_TYPE, method: 'manual',
    recipient_phone: target.phone, recipient_name: recipientName,
    body: sms.text, status: 'sent',
    metadata: { contract_id: params.id, template_id: sms.templateId, sms_type: sms.type },
  })

  const { email, emailError } = await sendDeliveryEmail({
    supabase, contractId: params.id, to: target.email, recipientName,
    businessName, contactName: customer?.contact_name ?? null,
    pdfUrl, completedAt: contract.admin_signed_at as string | null,
  })

  return NextResponse.json({ success: true, sms: 'sent', email, emailError, phone: target.phone, emailTo: target.email })
}

/** 계약서·고객 정보에 이메일이 비어 있으면 이번에 쓴 주소로 채운다 (이미 있으면 건드리지 않는다) */
async function backfillEmail(
  supabase: Supabase, contractId: string, contractEmail: string | null, customer: CustomerRow | null, email: string | null,
) {
  if (!email) return
  if (!contractEmail) {
    const { error } = await supabase.from('contracts').update({ customer_email: email }).eq('id', contractId)
    if (error) console.error('[CONTRACT_DELIVER] 계약서 이메일 보강 실패:', error.message)
  }
  if (customer && !customer.email) {
    const { error } = await supabase.from('customers').update({ email }).eq('id', customer.id)
    if (error) console.error('[CONTRACT_DELIVER] 고객 이메일 보강 실패:', error.message)
  }
}

/** Storage 의 서명 완료 PDF 를 읽어 첨부 파일로 만든다. 실패하면 null (링크만 보낸다) */
async function loadPdfAttachment(supabase: Supabase, contractId: string, businessName: string): Promise<EmailAttachment | null> {
  try {
    const { data, error } = await supabase.storage.from('contracts').download(`${contractId}/signed.pdf`)
    if (error || !data) {
      console.error('[CONTRACT_DELIVER] PDF 다운로드 실패:', error?.message ?? 'no data')
      return null
    }
    return { filename: contractPdfFileName(businessName), content: Buffer.from(await data.arrayBuffer()), contentType: 'application/pdf' }
  } catch (e) {
    console.error('[CONTRACT_DELIVER] PDF 다운로드 오류:', e instanceof Error ? e.message : String(e))
    return null
  }
}

async function sendDeliveryEmail(opts: {
  supabase: Supabase
  contractId: string
  to: string | null
  recipientName: string | null
  businessName: string
  contactName: string | null
  pdfUrl: string
  completedAt: string | null
}): Promise<{ email: EmailOutcome; emailError: string | null }> {
  if (!opts.to) return { email: 'skipped', emailError: null }

  const attachment = await loadPdfAttachment(opts.supabase, opts.contractId, opts.businessName)
  const mail = buildContractDeliveryEmail({
    businessName: opts.businessName, contactName: opts.contactName,
    pdfUrl: opts.pdfUrl, completedAt: opts.completedAt, attached: attachment !== null,
  })
  const base = {
    category: 'email', type: HISTORY_TYPE, method: 'manual',
    recipient_name: opts.recipientName, title: mail.subject,
    metadata: { contract_id: opts.contractId, recipient_email: opts.to, pdf_attached: attachment !== null },
  }
  try {
    await sendHtmlEmail({
      toEmail: opts.to, subject: mail.subject, html: mail.html, text: mail.text, fromName: '범빌드코리아',
      attachments: attachment ? [attachment] : undefined,
    })
    await opts.supabase.from('notification_history').insert({ ...base, body: mail.text, status: 'sent' })
    return { email: 'sent', emailError: null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[CONTRACT_DELIVER] 이메일 발송 실패', { contractId: opts.contractId, to: opts.to, msg })
    await opts.supabase.from('notification_history').insert({ ...base, status: 'failed', error_message: msg })
    return { email: 'failed', emailError: msg }
  }
}
