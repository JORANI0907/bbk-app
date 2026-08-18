import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSMS } from '@/lib/solapi'
import { sendSlack } from '@/lib/slack'
import { sendContractCompletedEmails } from '@/lib/email'
import { renderTemplateWithVars } from '@/lib/contractTemplate'

type RouteParams = { params: { id: string } }

// POST /api/admin/contracts/[id]/admin-sign — 관리자 최종 확인
export async function POST(request: NextRequest, { params }: RouteParams) {
  const supabase = createServiceClient()

  const { data: contract, error: fetchError } = await supabase
    .from('contracts')
    .select('id, signing_status, customer_phone, subscription_plan, contract_snapshot, customers(business_name, contact_name, email)')
    .eq('id', params.id)
    .single()

  if (fetchError || !contract) {
    return NextResponse.json({ success: false, error: '계약서를 찾을 수 없습니다.' }, { status: 404 })
  }

  if (contract.signing_status !== 'customer_signed') {
    return NextResponse.json(
      { success: false, error: '고객 서명이 완료된 계약서만 최종 확인할 수 있습니다.' },
      { status: 400 },
    )
  }

  let body: { adminSignature?: string; pdfBase64?: string; supplierStamp?: string }
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const { adminSignature, pdfBase64, supplierStamp } = body
  const now = new Date().toISOString()

  // 관리자 서명·공급사 직인은 필수
  if (!adminSignature || adminSignature.length < 100) {
    return NextResponse.json({ success: false, error: '관리자 서명이 필요합니다.' }, { status: 400 })
  }
  if (!supplierStamp || supplierStamp.length < 100) {
    return NextResponse.json({ success: false, error: '공급사 직인 이미지가 필요합니다.' }, { status: 400 })
  }

  // PDF를 Supabase Storage에 업로드
  let pdfUrl: string | null = null
  if (pdfBase64) {
    try {
      await supabase.storage.createBucket('contracts', { public: false }).catch(() => {})
      const { error: uploadError } = await supabase.storage
        .from('contracts')
        .upload(`${params.id}/signed.pdf`, Buffer.from(pdfBase64, 'base64'), {
          contentType: 'application/pdf',
          upsert: true,
        })
      if (!uploadError) {
        const { data: signed } = await supabase.storage
          .from('contracts')
          .createSignedUrl(`${params.id}/signed.pdf`, 3153600000)
        pdfUrl = signed?.signedUrl ?? null
      }
    } catch (e) {
      console.error('[admin-sign] PDF 업로드 실패:', e)
    }
  }

  const { error: updateError } = await supabase
    .from('contracts')
    .update({
      signing_status: 'completed',
      admin_signed_at: now,
      admin_signature: adminSignature,
      supplier_stamp: supplierStamp,
      signed_pdf_url: pdfUrl,
    })
    .eq('id', params.id)

  if (updateError) {
    return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
  }

  const customer = contract.customers as { business_name?: string; contact_name?: string; email?: string | null } | null
  const businessName = customer?.business_name ?? '고객'
  const rawEmail = (customer?.email as string | null) ?? null
  // 포털 가상 이메일·형식 오류 이메일은 발송 대상에서 제외
  const customerEmail = rawEmail &&
    !rawEmail.endsWith('@bbkorea.app') &&
    !rawEmail.endsWith('@bbkorea.co.kr') &&
    !rawEmail.endsWith('@bbkorea.hq') &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(rawEmail)
    ? rawEmail
    : null

  // 이메일 발송 (실패해도 계약 완료는 유지)
  if (pdfBase64) {
    try {
      await sendContractCompletedEmails({ customerEmail, businessName, pdfBase64 })
    } catch (e) {
      console.error('[admin-sign] 이메일 발송 실패:', e)
    }
  }

  // 고객 완료 SMS
  const phone = contract.customer_phone as string | null
  if (phone) {
    try {
      await sendSMS(
        phone,
        `[BBK 공간케어] ${businessName}님, 계약서 서명이 최종 완료되었습니다.\n계약서는 작성하신 이메일로 발송되었습니다. * 이메일 : ${customerEmail ?? '-'}`,
      )
    } catch {
      // SMS 실패는 무시
    }
  }

  // 스냅샷에 관리자 서명·공급사 직인 반영
  // 1) 플레이스홀더가 있으면 치환
  // 2) 하나라도 빠져 있으면 계약서 하단에 자동 서명 블록 첨부
  {
    const currentHtml = (contract.contract_snapshot as { html?: string } | null)?.html ?? ''
    const injectVars: Record<string, string> = {}
    const hasAdminSigPlaceholder = currentHtml.includes('{{ADMIN_SIGNATURE}}')
    const hasSupplierStampPlaceholder = currentHtml.includes('{{SUPPLIER_STAMP}}')

    if (hasAdminSigPlaceholder) {
      injectVars.ADMIN_SIGNATURE = `<img src="${adminSignature}" style="display:block;max-width:200px;max-height:80px;object-fit:contain;margin:8px 0;" alt="관리자 서명" />`
    }
    if (hasSupplierStampPlaceholder) {
      injectVars.SUPPLIER_STAMP = `<img src="${supplierStamp}" style="display:block;max-width:100px;max-height:100px;object-fit:contain;" alt="공급사 직인" />`
    }

    const htmlAfterVars = Object.keys(injectVars).length > 0
      ? renderTemplateWithVars(currentHtml, injectVars)
      : currentHtml

    // 관리자 서명 블록: 플레이스홀더가 하나라도 빠져 있으면 계약서 하단에 자동 추가
    const missing = !hasAdminSigPlaceholder || !hasSupplierStampPlaceholder
    const adminBlockHtml = missing ? `
<div style="margin-top:24px;padding:20px;border:1px solid #d1d5db;border-radius:8px;background:#f9fafb;page-break-inside:avoid;">
  <p style="font-weight:bold;color:#111827;margin:0 0 12px;font-size:13px;">■ 공급사(범빌드코리아) 서명 · 직인</p>
  <table style="width:100%;border-collapse:collapse;font-size:12px;">
    <tr>
      <td style="padding:8px;vertical-align:middle;width:80px;color:#6b7280;">서명</td>
      <td style="padding:8px;vertical-align:middle;">
        <img src="${adminSignature}" style="max-height:60px;max-width:200px;display:inline-block;vertical-align:middle;" alt="관리자 서명" />
      </td>
    </tr>
    <tr>
      <td style="padding:8px;vertical-align:middle;color:#6b7280;">직인</td>
      <td style="padding:8px;vertical-align:middle;">
        <img src="${supplierStamp}" style="max-height:90px;max-width:90px;display:inline-block;vertical-align:middle;object-fit:contain;" alt="공급사 직인" />
      </td>
    </tr>
    <tr>
      <td style="padding:8px;vertical-align:middle;color:#6b7280;">확인일시</td>
      <td style="padding:8px;vertical-align:middle;color:#374151;">${now}</td>
    </tr>
  </table>
</div>`.trim() : ''

    const finalHtml = missing ? `${htmlAfterVars}\n${adminBlockHtml}` : htmlAfterVars

    if (finalHtml !== currentHtml) {
      // 스냅샷의 다른 키(customer_info 등)는 보존하기 위해 spread 병합
      const prevSnapshot = (contract.contract_snapshot as Record<string, unknown> | null) ?? {}
      await supabase
        .from('contracts')
        .update({ contract_snapshot: { ...prevSnapshot, html: finalHtml } })
        .eq('id', params.id)
    }
  }

  await sendSlack(`✅ *계약서 최종 완료* | ${businessName} | ${contract.subscription_plan as string ?? ''}`)

  return NextResponse.json({ success: true, message: '계약서가 최종 확인되었습니다.' })
}
