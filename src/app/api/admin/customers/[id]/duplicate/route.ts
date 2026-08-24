import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// 복제 시 원본에서 "한 번만" 가져올 텍스트 정보 목록 (화이트리스트).
// 여기에 없는 필드는 자동으로 초기값이 되어 원본과 완전히 분리된다.
// 라이브성 필드(구글폴더 URL, 알림이력, 결제상태, 결제이력, 계약이력 등)는 이 목록에서 제외.
const CUSTOMER_SNAPSHOT_FIELDS = [
  // 사업장 기본 정보
  'business_name', 'business_number',
  'address', 'address_detail', 'latitude', 'longitude',
  // 연락처
  'contact_name', 'contact_phone', 'contact_phone_2', 'email',
  'platform_nickname',
  // 현장 접근 정보
  'door_password', 'gas_location', 'power_location', 'parking_info', 'special_notes',
  'elevator', 'building_access', 'access_method',
  // 운영시간·시공시간
  'business_hours_start', 'business_hours_end', 'construction_time',
  // 계약 설정(텍스트성 - 정기 계약 조건은 신규 계약에도 유지)
  'customer_type', 'payment_method', 'account_number',
  'care_scope', 'care_manual', 'notes', 'admin_notes',
  'grade', 'disposition',
  'tax_invoice_required',
  // 방문 스케줄 설정(계약 조건)
  'visit_schedule_type', 'visit_weekdays', 'visit_monthly_dates',
  'schedule_generation_day', 'visit_cycle', 'visit_cycle_unit',
  'visit_cycle_value', 'visit_cycle_config', 'visit_monthly_count',
  'visit_count_per_month', 'visit_interval_days',
  'circulation_type', 'visit_option', 'rotation_type', 'injection_cycle_months',
  // 결제 조건 설정(금액 자체, 아직 발생하지 않은 청구 규칙)
  'unit_price', 'billing_amount', 'billing_cycle', 'billing_day',
  'billing_monthly_amount', 'billing_yearly_amount', 'billing_unit_price',
  'billing_trigger', 'billing_timing', 'billing_paid_months',
  'yearly_billing_month', 'yearly_billing_day', 'payment_date',
  // 알림 수신 동의(전화번호별 스위치)
  'phone_notify_1', 'phone_notify_2',
] as const

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
  const snapshot: Record<string, unknown> = {}
  for (const key of CUSTOMER_SNAPSHOT_FIELDS) {
    if (key in original) snapshot[key] = (original as Record<string, unknown>)[key]
  }

  // 신규 계약의 초기 파이프라인 상태
  snapshot.pipeline_status = 'inquiry'

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
