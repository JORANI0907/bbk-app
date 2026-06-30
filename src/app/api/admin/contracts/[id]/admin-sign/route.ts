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
      admin_signature: adminSignature ?? null,
      signed_pdf_url: pdfUrl,
    })
    .eq('id', params.id)

  if (updateError) {
    return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
  }

  const customer = contract.customers as { business_name?: string; contact_name?: string; email?: string | null } | null
  const businessName = customer?.business_name ?? '고객'
  const customerEmail = (customer?.email as string | null) ?? null

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

  // 공급사 직인 → 스냅샷에 주입
  if (supplierStamp) {
    const currentHtml = (contract.contract_snapshot as { html?: string } | null)?.html ?? ''
    if (currentHtml.includes('{{SUPPLIER_STAMP}}')) {
      const stampImg = `<img src="${supplierStamp}" style="display:block;max-width:100px;max-height:100px;object-fit:contain;" alt="공급사 직인" />`
      const updatedHtml = renderTemplateWithVars(currentHtml, { SUPPLIER_STAMP: stampImg })
      await supabase
        .from('contracts')
        .update({ contract_snapshot: { html: updatedHtml } })
        .eq('id', params.id)
    }
  }

  await sendSlack(`✅ *계약서 최종 완료* | ${businessName} | ${contract.subscription_plan as string ?? ''}`)

  return NextResponse.json({ success: true, message: '계약서가 최종 확인되었습니다.' })
}
