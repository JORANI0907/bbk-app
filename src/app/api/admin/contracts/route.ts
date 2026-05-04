import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  renderContract,
  extractVariablesFromCustomer,
  renderTemplateWithVars,
  extractTemplateVars,
  resolveAutoField,
  PROCESS_AUTO_FIELDS,
  type TemplateVarConfigMap,
} from '@/lib/contractTemplate'
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

// POST /api/admin/contracts — 새 계약서 생성
export async function POST(request: NextRequest) {
  const supabase = createServiceClient()

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 형식입니다.' }, { status: 400 })
  }

  const { customer_id, service_plan, visit_option, monthly_price, annual_price,
    contract_start_date, contract_end_date, selected_items, customer_phone,
    application_id, template_id, custom_vars } = body

  if (!customer_id) {
    return NextResponse.json({ success: false, error: 'customer_id는 필수입니다.' }, { status: 400 })
  }

  // 고객 정보 조회
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customer_id as string)
    .single()

  if (customerError || !customer) {
    return NextResponse.json({ success: false, error: '고객 정보를 찾을 수 없습니다.' }, { status: 404 })
  }

  const signingToken = crypto.randomUUID()
  const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const contractRecord = {
    customer_id,
    contract_type: 'subscription',
    monthly_price: monthly_price ?? customer.billing_amount ?? 0,
    annual_price: annual_price ?? null,
    start_date: contract_start_date ?? customer.contract_start_date ?? null,
    end_date: contract_end_date ?? customer.contract_end_date ?? null,
    selected_items: selected_items ?? [],
    customer_phone: customer_phone ?? customer.contact_phone ?? '',
    signing_token: signingToken,
    token_expires_at: tokenExpiresAt,
    signing_status: 'draft',
    application_id: application_id ?? null,
    template_id: template_id ?? null,
  }

  // contract_snapshot 생성 — template_id 있으면 DB 템플릿 사용, 없으면 기존 renderContract
  const contractDate = new Date()
  let snapshot: string

  // 기본 변수 맵 (backward compat + fallback)
  const defaultVars: Record<string, string> = {
    CONTRACT_YEAR: String(contractDate.getFullYear()),
    CONTRACT_MONTH: String(contractDate.getMonth() + 1).padStart(2, '0'),
    CONTRACT_DAY: String(contractDate.getDate()).padStart(2, '0'),
    CUSTOMER_BUSINESS_NAME: (customer.business_name as string | null) ?? '',
    CUSTOMER_BUSINESS_NUMBER: (customer.business_number as string | null) ?? '',
    CUSTOMER_OWNER_NAME: (customer.contact_name as string | null) ?? '',
    CUSTOMER_ADDRESS: [customer.address, customer.address_detail].filter(Boolean).join(' '),
    CUSTOMER_PHONE: (customer.contact_phone as string | null) ?? '',
    CUSTOMER_EMAIL: (customer.email as string | null) ?? '',
    MONTHLY_PRICE: contractRecord.monthly_price != null
      ? (contractRecord.monthly_price as number).toLocaleString('ko-KR')
      : '',
    ANNUAL_PRICE: contractRecord.annual_price != null
      ? (contractRecord.annual_price as number).toLocaleString('ko-KR')
      : '',
    CONTRACT_START_DATE: (contractRecord.start_date as string | null) ?? '',
    CONTRACT_END_DATE: (contractRecord.end_date as string | null) ?? '',
    SERVICE_SCOPE: Array.isArray(selected_items) ? (selected_items as string[]).join(', ') : '',
    SELECTED_ITEMS_LIST:
      Array.isArray(selected_items) && (selected_items as string[]).length > 0
        ? `<ul>${(selected_items as string[]).map((i) => `<li>${i}</li>`).join('')}</ul>`
        : '',
  }

  if (template_id) {
    const { data: tmpl } = await supabase
      .from('contract_templates')
      .select('html_body, var_config')
      .eq('id', template_id as string)
      .single()

    if (tmpl) {
      const varConfigMap = (tmpl.var_config ?? {}) as TemplateVarConfigMap
      const hasVarConfig = Object.keys(varConfigMap).length > 0
      const vars: Record<string, string> = { ...defaultVars }

      if (hasVarConfig) {
        // var_config 있으면 각 변수를 설정대로 resolve
        for (const varName of extractTemplateVars(tmpl.html_body)) {
          const config = varConfigMap[varName]
          if (!config) continue
          if (config.mode === 'auto' && config.autoField) {
            // 계약 과정 필드(서명, 서비스항목 등)는 스냅샷에 {{VAR}} 그대로 보존
            if (!PROCESS_AUTO_FIELDS.has(config.autoField)) {
              vars[varName] = resolveAutoField(config.autoField, customer, contractRecord)
            }
          } else if (config.mode === 'manual') {
            vars[varName] = (custom_vars as Record<string, string>)?.[varName] ?? ''
          }
        }
      } else if (custom_vars && typeof custom_vars === 'object') {
        // var_config 없으면 old 방식 (custom_vars 직접 병합)
        Object.assign(vars, custom_vars as Record<string, string>)
      }

      snapshot = renderTemplateWithVars(tmpl.html_body, vars)
    } else {
      snapshot = renderContract(extractVariablesFromCustomer(customer, contractRecord))
    }
  } else {
    snapshot = renderContract(extractVariablesFromCustomer(customer, contractRecord))
  }

  const { data: created, error: insertError } = await supabase
    .from('contracts')
    .insert({ ...contractRecord, contract_snapshot: { html: snapshot } })
    .select()
    .single()

  if (insertError) {
    return NextResponse.json({ success: false, error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data: created }, { status: 201 })
}
