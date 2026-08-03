/**
 * Phase 25: 알림 템플릿 렌더러
 * `{{변수라벨}}` 패턴을 context 값으로 치환.
 * 알 수 없는 라벨은 원문 유지 (관리자가 오타 발견 쉽게).
 */

import { VARIABLES_BY_LABEL, NotificationContext } from './notification-variables'

const VAR_PATTERN = /\{\{([^}]+)\}\}/g

export function renderTemplate(body: string, ctx: NotificationContext): string {
  return body.replace(VAR_PATTERN, (_match, rawLabel: string) => {
    const label = rawLabel.trim()
    const def = VARIABLES_BY_LABEL[label]
    if (!def) return `{{${label}}}`  // 알 수 없는 변수는 원문 유지
    const value = def.resolve(ctx)
    if (value == null || value === '') return ''
    return String(value)
  })
}

/**
 * 미리보기용 sample context — 실 데이터 없을 때 dummy 값으로 렌더
 */
export const SAMPLE_CONTEXT: NotificationContext = {
  customer: {
    business_name: '홍길동상회',
    business_number: '123-45-67890',
    contact_name: '홍길동',
    contact_phone: '010-1234-5678',
    contact_phone_2: '010-9999-8888',
    email: 'hong@example.com',
    address: '서울시 강남구 테헤란로 123',
    address_detail: '5층 501호',
    payment_method: '현금(계산서 희망)',
    account_number: '기업 123-456-789012',
    unit_price: 200000,
    supply_amount: 500000,
    vat: 50000,
    deposit: 100000,
    balance: 450000,
    deposit_payment_url: 'https://pay.example/deposit/abc',
    balance_payment_url: 'https://pay.example/balance/abc',
    billing_card_url: 'https://pay.example/card/abc',
    billing_cycle: '월간',
    billing_amount: 300000,
    billing_start_date: '2026-01-01',
    billing_next_date: '2026-08-25',
    billing_day: 25,
    contract_start_date: '2026-01-01',
    contract_end_date: '2026-12-31',
    contract_drive_url: 'https://drive.google.com/contract',
    payment_date: 25,
    next_visit_date: '2026-08-15',
    visit_interval_days: 30,
    visit_monthly_count: '2회',
    injection_cycle_months: '1개월',
    visit_weekdays: ['월', '수', '금'],
    business_hours_start: '09:00',
    business_hours_end: '22:00',
    meeting_time: '방문일 오전 10시',
    construction_time: '14:00',
    care_scope: '후드·덕트 청소',
    door_password: '1234*',
    parking_info: '건물 지하 무료 2시간',
    gas_location: '주방 좌측 상단',
    power_location: '카운터 뒤편',
    elevator: '있음(화물)',
    building_access: '자동문',
    access_method: '카운터에서 열쇠 수령',
    special_notes: '반려동물 있음',
    drive_folder_url: 'https://drive.google.com/photos',
  },
  application: {
    business_name: '홍길동상회',
    business_number: '123-45-67890',
    owner_name: '홍길동',
    phone: '010-1234-5678',
    phone_2: '010-9999-8888',
    email: 'hong@example.com',
    address: '서울시 강남구 테헤란로 123',
    construction_date: '2026-08-15',
    construction_time: '14:00',
    business_hours_start: '09:00',
    business_hours_end: '22:00',
    pre_meeting_at: '2026-08-14T10:00:00',
    meeting_time: '방문일 오전 10시',
    payment_method: '현금(계산서 희망)',
    account_number: '기업 123-456-789012',
    supply_amount: 500000,
    vat: 50000,
    deposit: 100000,
    balance: 450000,
    deposit_payment_url: 'https://pay.example/deposit/abc',
    balance_payment_url: 'https://pay.example/balance/abc',
    virtual_account_number: '1234-5678-9012',
    virtual_account_bank: '국민은행',
    care_scope: '후드·덕트 청소',
    space_size: '30평',
    parking: '건물 지하 무료 2시간',
    elevator: '있음(화물)',
    building_access: '자동문',
    access_method: '카운터에서 열쇠 수령',
    drive_folder_url: 'https://drive.google.com/photos',
    request_notes: '냄새 나는 부분 집중 청소 부탁',
  },
  schedule: {
    scheduled_date: '2026-08-15',
    scheduled_time_start: '14:00',
    scheduled_time_end: '17:00',
    payment_amount: 200000,
    payment_date: '2026-08-20',
    worker_memo: '작업 원활히 진행됨',
  },
  extra: {
    quote_no: 'BBK-D-20260803120000-001',
    quote_total: '1,100,000원',
    quote_valid_until: '2026.08.08',
    quote_pdf_url: 'https://andmmbxhtufwvtsgdhti.supabase.co/storage/v1/object/public/quote-pdfs/sample.pdf',
    contract_no: 'BBK-C-20260803',
    contract_pdf_url: 'https://drive.google.com/sample',
    payroll_month: '2026년 8월',
    payroll_amount: '2,500,000원',
    payroll_date: '8월 25일',
    worker_name: '홍길동',
    checkin_expected: '08:00',
    checkin_status: '지각',
    late_minutes: '30분',
  },
}
