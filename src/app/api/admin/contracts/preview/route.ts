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

// POST /api/admin/contracts/preview — HTML 미리보기 생성 (DB 저장 없음)
export async function POST(request: NextRequest) {
  const supabase = createServiceClient()

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 형식입니다.' }, { status: 400 })
  }

  const {
    customer_id, monthly_price, annual_price,
    contract_start_date, contract_end_date, selected_items,
    customer_phone, template_id, custom_vars,
  } = body

  if (!customer_id) {
    return NextResponse.json({ success: false, error: 'customer_id는 필수입니다.' }, { status: 400 })
  }

  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customer_id as string)
    .single()

  if (customerError || !customer) {
    return NextResponse.json({ success: false, error: '고객 정보를 찾을 수 없습니다.' }, { status: 404 })
  }

  const contractRecord = {
    monthly_price: monthly_price ?? customer.billing_amount ?? 0,
    annual_price: annual_price ?? null,
    start_date: contract_start_date ?? customer.contract_start_date ?? null,
    end_date: contract_end_date ?? customer.contract_end_date ?? null,
    selected_items: selected_items ?? [],
    customer_phone: customer_phone ?? customer.contact_phone ?? '',
  }

  const contractDate = new Date()
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

  let snapshot: string

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
        for (const varName of extractTemplateVars(tmpl.html_body)) {
          const config = varConfigMap[varName]
          if (!config) continue
          if (config.mode === 'auto' && config.autoField) {
            if (!PROCESS_AUTO_FIELDS.has(config.autoField)) {
              vars[varName] = resolveAutoField(config.autoField, customer, contractRecord)
            }
          } else if (config.mode === 'manual') {
            vars[varName] = (custom_vars as Record<string, string>)?.[varName] ?? ''
          }
        }
      } else if (custom_vars && typeof custom_vars === 'object') {
        Object.assign(vars, custom_vars as Record<string, string>)
      }

      snapshot = renderTemplateWithVars(tmpl.html_body, vars)
    } else {
      snapshot = renderContract(extractVariablesFromCustomer(customer, contractRecord))
    }
  } else {
    snapshot = renderContract(extractVariablesFromCustomer(customer, contractRecord))
  }

  return NextResponse.json({ success: true, data: { html: snapshot } })
}
