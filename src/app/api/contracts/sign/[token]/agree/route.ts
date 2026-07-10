import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { otpStore } from '@/lib/otp-store'
import { sendSlack } from '@/lib/slack'
import { renderTemplateWithVars } from '@/lib/contractTemplate'

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
    .select('id, signing_status, token_expires_at, otp_code, otp_expires_at, subscription_plan, contract_snapshot, customers(business_name, contact_name)')
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

  let body: {
    phone?: string
    otp?: string
    article8Agree?: boolean
    article14Agree?: boolean
    customerSignature?: string
    customerSignerName?: string
    customerStamp?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 형식입니다.' }, { status: 400 })
  }

  const { phone, otp, article8Agree, article14Agree, customerSignature, customerSignerName, customerStamp } = body

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
      customer_signature: customerSignature ?? null,
      customer_signer_name: customerSignerName ?? null,
      otp_code: null,
      otp_expires_at: null,
    })
    .eq('id', contract.id as string)

  if (updateError) {
    return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
  }

  // 스냅샷에 성명·직인 변수 치환 (존재하는 변수만)
  const snapshot = contract.contract_snapshot as { html?: string } | null
  const currentHtml = snapshot?.html ?? ''
  const injectVars: Record<string, string> = {}

  if (customerSignerName && currentHtml.includes('{{CUSTOMER_SIGNER_NAME}}')) {
    injectVars.CUSTOMER_SIGNER_NAME = `<img src="${customerSignerName}" style="max-height:40px;max-width:160px;display:inline-block;vertical-align:middle;" alt="서명자 성명" />`
  }
  if (customerStamp && currentHtml.includes('{{CUSTOMER_STAMP}}')) {
    injectVars.CUSTOMER_STAMP = `<img src="${customerStamp}" style="display:block;max-width:100px;max-height:100px;object-fit:contain;" alt="고객사 직인" />`
  }

  // 확약 사항 박스: 고객이 체크한 3개 항목(제8조, 제14조, 대표자 본인 확약) 을 계약서 본문 하단에 박제.
  // 변조 방지를 위해 문구는 서버 상수로 고정. 서명일시·IP 도 함께 기록.
  const agreementStatements = [
    '제8조 (서비스 제공 장소 및 환경) 조항에 동의합니다.',
    '제14조 (개인정보 보호) 조항에 동의합니다.',
    '계약 대표자 본인이 직접 서명, 직인 하였습니다. (대표자가 아닌 경우 계약은 무효처리되며 모든 책임은 계약자 본인에게 있습니다)',
  ]
  const agreementBoxHtml = `
<div style="margin-top:32px;padding:16px 18px;border:2px solid #e11d48;border-radius:8px;background:#fef2f2;page-break-inside:avoid;">
  <p style="font-weight:bold;color:#e11d48;margin:0 0 6px;font-size:13px;">■ 고객 확약 사항</p>
  <p style="font-size:11px;color:#6b7280;margin:0 0 10px;">아래 사항은 고객이 서명 시 모두 확인·동의한 내용이며, 계약의 일부로 편입됩니다.</p>
  <ol style="margin:0 0 10px;padding-left:20px;font-size:12px;color:#111827;line-height:1.7;">
    ${agreementStatements.map(s => `<li>${s.replace(/</g, '&lt;')}</li>`).join('')}
  </ol>
  <p style="font-size:10px;color:#6b7280;margin:0;border-top:1px dashed #fecaca;padding-top:8px;">
    서명일시: ${now} · IP: ${clientIp}
  </p>
</div>`.trim()

  const htmlAfterVars = Object.keys(injectVars).length > 0
    ? renderTemplateWithVars(currentHtml, injectVars)
    : currentHtml
  const finalHtml = `${htmlAfterVars}\n${agreementBoxHtml}`

  await supabase
    .from('contracts')
    .update({ contract_snapshot: { html: finalHtml } })
    .eq('id', contract.id as string)

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
