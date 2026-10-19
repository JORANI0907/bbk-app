/**
 * 고객 복제 시 "한 번만" 가져올 텍스트 성격의 필드 화이트리스트.
 *
 * 2026-10-19: 신청서(service_applications) 복제 라우트에서도 재사용. 복제 시 원본과
 * customer_id 를 공유하면 축 A/축 C 양방향 sync 로 "복제본 수정이 원본까지 전파"되는
 * 사고가 발생하므로, 신청서 복제도 customer master 를 함께 복제해 완전 분리한다.
 *
 * 여기에 없는 필드는 자동으로 초기값이 되어 원본과 완전히 분리된다.
 * 라이브성 필드(구글폴더 URL, 알림이력, 결제상태, 결제이력, 계약이력 등)는 제외.
 */
export const CUSTOMER_SNAPSHOT_FIELDS = [
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

export function buildCustomerSnapshot(original: Record<string, unknown>): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {}
  for (const key of CUSTOMER_SNAPSHOT_FIELDS) {
    if (key in original) snapshot[key] = original[key]
  }
  snapshot.pipeline_status = 'inquiry'
  return snapshot
}
