import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { renderContract, extractVariablesFromCustomer } from '@/lib/contractTemplate'
import crypto from 'crypto'

// GET /api/admin/contracts — 계약서 목록
export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  let query = supabase
    .from('contracts')
    .select('*, customers(business_name, contact_name, contact_phone, email)')
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
    application_id } = body

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
  }

  // contract_snapshot 생성 (renderContract)
  const variables = extractVariablesFromCustomer(customer, contractRecord)
  const snapshot = renderContract(variables)

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
