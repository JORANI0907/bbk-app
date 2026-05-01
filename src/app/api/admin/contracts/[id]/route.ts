import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { renderContract, extractVariablesFromCustomer } from '@/lib/contractTemplate'

type RouteParams = { params: { id: string } }

const EDITABLE_FIELDS = [
  'service_plan',
  'visit_option',
  'monthly_price',
  'annual_price',
  'contract_start_date',
  'contract_end_date',
  'selected_items',
  'customer_phone',
  'application_id',
]

// GET /api/admin/contracts/[id]
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('contracts')
    .select('*, customers(business_name, contact_name, contact_phone, email, address, address_detail, business_number)')
    .eq('id', params.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ success: false, error: '계약서를 찾을 수 없습니다.' }, { status: 404 })
  }

  return NextResponse.json({ success: true, data })
}

// PATCH /api/admin/contracts/[id] — draft 상태에서만 수정 가능
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const supabase = createServiceClient()

  // 현재 상태 확인
  const { data: existing, error: fetchError } = await supabase
    .from('contracts')
    .select('id, signing_status, customer_id')
    .eq('id', params.id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ success: false, error: '계약서를 찾을 수 없습니다.' }, { status: 404 })
  }

  if (existing.signing_status !== 'draft') {
    return NextResponse.json(
      { success: false, error: '초안(draft) 상태에서만 수정할 수 있습니다.' },
      { status: 400 },
    )
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 형식입니다.' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  for (const key of EDITABLE_FIELDS) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: false, error: '수정할 필드가 없습니다.' }, { status: 400 })
  }

  // snapshot 재생성
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('id', existing.customer_id as string)
    .single()

  if (customer) {
    const merged = { ...existing, ...updates }
    const variables = extractVariablesFromCustomer(customer, merged)
    updates.contract_snapshot = { html: renderContract(variables) }
  }

  const { error: updateError } = await supabase
    .from('contracts')
    .update(updates)
    .eq('id', params.id)

  if (updateError) {
    return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
