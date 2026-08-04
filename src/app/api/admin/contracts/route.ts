import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { renderContractPreview, type ContractCustomerInfo } from '@/lib/contractTemplate'
import crypto from 'crypto'

// GET /api/admin/contracts — 계약서 목록
export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  let query = supabase
    .from('contracts')
    .select('*, customers(business_name, contact_name, contact_phone, email)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (status && status !== 'all') {
    query = query.eq('signing_status', status)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}

/**
 * POST /api/admin/contracts — 새 계약서 생성 (v2)
 *
 * payload:
 *   {
 *     customer_id: string,
 *     template_id: string,
 *     customer_info: ContractCustomerInfo,   // 모달에서 수집한 최종 값 (수정본 포함)
 *     customer_phone: string,                // OTP 수신 번호
 *     html_body?: string,                    // 편집기에서 수정한 최종 HTML (없으면 서버 렌더)
 *     application_id?: string,
 *   }
 */
export async function POST(request: NextRequest) {
  const supabase = createServiceClient()

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 형식입니다.' }, { status: 400 })
  }

  const customerId = body.customer_id as string | undefined
  const templateId = body.template_id as string | undefined
  const customerPhone = String(body.customer_phone ?? '')
  const applicationId = body.application_id as string | undefined
  const htmlBody = typeof body.html_body === 'string' ? body.html_body : ''
  const rawInfo = (body.customer_info ?? {}) as Partial<ContractCustomerInfo>

  if (!customerId) {
    return NextResponse.json({ success: false, error: 'customer_id는 필수입니다.' }, { status: 400 })
  }
  if (!templateId) {
    return NextResponse.json({ success: false, error: '계약서 양식(template_id)이 필요합니다.' }, { status: 400 })
  }

  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('id, contact_phone')
    .eq('id', customerId)
    .single()

  if (customerError || !customer) {
    return NextResponse.json({ success: false, error: '고객 정보를 찾을 수 없습니다.' }, { status: 404 })
  }

  // customer_info 확정 (누락 필드는 빈 문자열로)
  const customerInfo: ContractCustomerInfo = {
    business_name:       rawInfo.business_name       ?? '',
    contact_name:        rawInfo.contact_name        ?? '',
    contact_phone:       rawInfo.contact_phone       ?? '',
    address:             rawInfo.address             ?? '',
    business_number:     rawInfo.business_number     ?? '',
    email:               rawInfo.email               ?? '',
    contract_start_date: rawInfo.contract_start_date ?? '',
    contract_end_date:   rawInfo.contract_end_date   ?? '',
    care_scope:          rawInfo.care_scope          ?? '',
  }

  // html_body 가 편집기에서 수정된 최종본 → 그대로 저장.
  // 없으면 서버에서 템플릿 + customer_info 로 렌더.
  let snapshot: string
  if (htmlBody.trim()) {
    snapshot = htmlBody
  } else {
    const { data: tmpl } = await supabase
      .from('contract_templates')
      .select('html_body')
      .eq('id', templateId)
      .single()
    if (!tmpl) {
      return NextResponse.json({ success: false, error: '양식을 찾을 수 없습니다.' }, { status: 404 })
    }
    snapshot = renderContractPreview(tmpl.html_body as string, customerInfo)
  }

  const signingToken = crypto.randomUUID()
  const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const record = {
    customer_id: customerId,
    contract_type: 'subscription',
    start_date: customerInfo.contract_start_date || null,
    end_date: customerInfo.contract_end_date || null,
    customer_phone: customerPhone || (customer.contact_phone as string ?? ''),
    signing_token: signingToken,
    token_expires_at: tokenExpiresAt,
    signing_status: 'draft',
    application_id: applicationId ?? null,
    template_id: templateId,
    contract_snapshot: {
      html: snapshot,
      customer_info: customerInfo,   // v2 스냅샷 저장: 재발행·감사 용
    },
  }

  const { data: created, error: insertError } = await supabase
    .from('contracts')
    .insert(record)
    .select()
    .single()

  if (insertError) {
    return NextResponse.json({ success: false, error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data: created }, { status: 201 })
}
