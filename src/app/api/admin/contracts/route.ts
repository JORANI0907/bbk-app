import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { renderContractForStorage, restoreSignaturePlaceholders, type ContractCustomerInfo } from '@/lib/contractTemplate'
import { resolveTemplateRegulations } from '@/lib/contract-regulation-vars.server'
import crypto from 'crypto'

// GET /api/admin/contracts — 계약서 목록
// ?party_type=customer|worker 로 대상 유형 필터
export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const partyType = searchParams.get('party_type')

  let query = supabase
    .from('contracts')
    .select('*, customers(business_name, contact_name, contact_phone, email), workers(name, phone, employment_type, position, department)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (status && status !== 'all') {
    query = query.eq('signing_status', status)
  }

  if (partyType === 'customer' || partyType === 'worker') {
    query = query.eq('party_type', partyType)
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
  const workerId = body.worker_id as string | undefined
  const templateId = body.template_id as string | undefined
  const customerPhone = String(body.customer_phone ?? '')
  const applicationId = body.application_id as string | undefined
  const htmlBody = typeof body.html_body === 'string' ? body.html_body : ''
  const rawInfo = (body.customer_info ?? {}) as Partial<ContractCustomerInfo>
  const workerInfo = (body.worker_info ?? {}) as Record<string, unknown>

  // XOR: customer_id 또는 worker_id 중 정확히 하나만 제공되어야 함
  if ((!customerId && !workerId) || (customerId && workerId)) {
    return NextResponse.json(
      { success: false, error: 'customer_id 또는 worker_id 중 정확히 하나만 지정하세요.' },
      { status: 400 },
    )
  }
  if (!templateId) {
    return NextResponse.json({ success: false, error: '계약서 양식(template_id)이 필요합니다.' }, { status: 400 })
  }

  const partyType: 'customer' | 'worker' = workerId ? 'worker' : 'customer'

  // 대상 존재 확인 (customer 또는 worker)
  let signerPhone = ''
  let serviceType: string | null = null
  if (partyType === 'customer' && customerId) {
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id, contact_phone, customer_type')
      .eq('id', customerId)
      .single()
    if (customerError || !customer) {
      return NextResponse.json({ success: false, error: '고객 정보를 찾을 수 없습니다.' }, { status: 404 })
    }
    signerPhone = customerPhone || (customer.contact_phone as string ?? '')
    serviceType = (customer.customer_type as string | null) ?? null
  } else if (partyType === 'worker' && workerId) {
    const { data: worker, error: workerError } = await supabase
      .from('workers')
      .select('id, phone')
      .eq('id', workerId)
      .single()
    if (workerError || !worker) {
      return NextResponse.json({ success: false, error: '직원 정보를 찾을 수 없습니다.' }, { status: 404 })
    }
    signerPhone = customerPhone || (worker.phone as string ?? '')
  }

  // customer_info 확정 (누락 필드는 빈 문자열로) — 직원 계약도 렌더러 재사용 위해
  // 동일 스키마를 씀. contact_name 에는 직원명이 들어감.
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
    amount_supply:       rawInfo.amount_supply       ?? '',
    amount_vat:          rawInfo.amount_vat          ?? '',
    amount_total:        rawInfo.amount_total        ?? '',
    visit_schedule:      rawInfo.visit_schedule      ?? '',
    payment_terms:       rawInfo.payment_terms       ?? '',
  }

  // html_body 가 편집기에서 수정된 최종본 → 그대로 저장.
  // 없으면 서버에서 템플릿 + customer_info 로 렌더.
  // ⚠️ preview API/편집기가 서명 변수를 dashed placeholder 로 이미 렌더링한 상태로
  //    보내오는 경우가 있어, 저장 직전 반드시 sanitize 하여 v2 변수로 되돌린다.
  const { data: tmpl } = await supabase
    .from('contract_templates')
    .select('html_body, var_config')
    .eq('id', templateId)
    .single()
  if (!tmpl) {
    return NextResponse.json({ success: false, error: '양식을 찾을 수 없습니다.' }, { status: 404 })
  }
  let snapshot: string = htmlBody.trim()
    ? restoreSignaturePlaceholders(htmlBody)
    : renderContractForStorage(tmpl.html_body as string, customerInfo)

  // 규정 변수 치환 + 참조 규정 본문을 스냅샷에 고정 (서명 당시 판). 미리보기에서 이미 채워졌어도
  // 양식 설정의 참조 목록은 여기서 다시 읽어 저장한다. 변수가 남으면 생성을 막는다 — 빈칸 계약서 방지.
  let regulationDocs: unknown[] = []
  let agreementsRequired: unknown[] = []
  try {
    const reg = await resolveTemplateRegulations(supabase, {
      html: snapshot, varConfig: tmpl.var_config, serviceType, allowDraft: true,
    })
    if (reg.missing.length > 0) {
      return NextResponse.json(
        { success: false, error: `참조 규정을 찾을 수 없습니다: ${reg.missing.join(', ')}. 회사 규정에서 먼저 등록해 주세요.` },
        { status: 400 },
      )
    }
    if (reg.unresolved.length > 0) {
      return NextResponse.json(
        { success: false, error: `채우지 못한 규정 변수가 있습니다: ${reg.unresolved.join(', ')}` },
        { status: 400 },
      )
    }
    snapshot = reg.html
    regulationDocs = reg.docs
    agreementsRequired = reg.agreementsRequired
  } catch (e) {
    console.error('[CONTRACT_CREATE] 규정 변수 치환 실패:', e instanceof Error ? e.message : e)
    return NextResponse.json({ success: false, error: '규정 본문을 불러오지 못해 계약서를 만들 수 없습니다.' }, { status: 500 })
  }

  const signingToken = crypto.randomUUID()
  const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const record = {
    party_type: partyType,
    customer_id: partyType === 'customer' ? customerId : null,
    worker_id: partyType === 'worker' ? workerId : null,
    contract_type: 'subscription',
    // 상세 화면의 서비스 플랜·방문 주기 칸 — 고객 유형과 모달의 방문 주기 문장으로 채운다
    subscription_plan: serviceType ?? null,
    visit_frequency: customerInfo.visit_schedule || null,
    start_date: customerInfo.contract_start_date || null,
    end_date: customerInfo.contract_end_date || null,
    customer_phone: signerPhone,
    signing_token: signingToken,
    token_expires_at: tokenExpiresAt,
    signing_status: 'draft',
    application_id: applicationId ?? null,
    template_id: templateId,
    contract_snapshot: {
      html: snapshot,
      customer_info: customerInfo,   // v2 스냅샷 (직원 계약도 이 필드 재사용)
      // 참조 규정 본문(서명 당시 판 고정)과 서명 전 확인 항목. 양식에 설정이 없으면 빈 배열.
      regulation_docs: regulationDocs,
      agreements_required: agreementsRequired,
      // 직원 계약이면 worker_info 도 함께 저장 (감사·재발행용 원본)
      ...(partyType === 'worker' ? { worker_info: workerInfo } : {}),
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
