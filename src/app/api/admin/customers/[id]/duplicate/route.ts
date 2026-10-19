import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { buildCustomerSnapshot } from '@/lib/customer-snapshot'

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient()
  const { id } = params

  if (!id) {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })
  }

  // 원본 조회
  const { data: original, error: fetchError } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !original) {
    return NextResponse.json({ error: '원본 데이터를 찾을 수 없습니다.' }, { status: 404 })
  }

  // 화이트리스트 스냅샷 — 명시된 텍스트 필드만 원본에서 복사.
  // 나머지(구글폴더 URL·알림이력·결제상태·PortOne ID·서명 이력·계약기간·다음 방문일·다음 결제일 등)는 자동 초기화.
  const snapshot = buildCustomerSnapshot(original as Record<string, unknown>)

  const { data: inserted, error: insertError } = await supabase
    .from('customers')
    .insert(snapshot)
    .select()
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // 짝이 되는 service_applications 자동 생성.
  // status는 '예약확정'으로 부여 → 서비스관리 리스트에 정상 노출됨.
  // 금액 필드(deposit/supply_amount/vat/balance)는 명시적으로 0으로 초기화 → 관리자가 신규 회차 금액을 다시 입력해야 함.
  try {
    await supabase.from('service_applications').insert({
      customer_id: inserted.id,
      business_name: inserted.business_name,
      owner_name: inserted.contact_name,
      phone: inserted.contact_phone,
      phone_2: inserted.contact_phone_2,
      email: inserted.email,
      address: inserted.address,
      business_hours_start: inserted.business_hours_start,
      business_hours_end: inserted.business_hours_end,
      construction_time: inserted.construction_time,
      care_scope: inserted.care_scope,
      service_type: inserted.customer_type,
      payment_method: inserted.payment_method,
      account_number: inserted.account_number,
      source: 'customer_direct',
      status: '예약확정',
      saved_quotes: [],
      // 금액은 신규 회차마다 다르므로 명시적 초기화 (관리자가 반드시 입력)
      deposit: 0,
      supply_amount: 0,
      vat: 0,
      balance: 0,
    })
  } catch (e) {
    console.error('duplicate customer→service_applications 자동 생성 실패:', e instanceof Error ? e.message : e)
  }

  return NextResponse.json({ customer: inserted })
}
