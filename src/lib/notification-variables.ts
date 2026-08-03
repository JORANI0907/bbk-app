/**
 * Phase 25: 알림 템플릿 변수 매핑 (자연어 라벨 ↔ 실제 데이터 필드)
 * - 관리자는 팔레트에서 자연어 라벨 클릭 → {{라벨}} 삽입
 * - 발송 시 renderTemplate이 context에서 값 추출해 치환
 */

export type VariableCategory = '일반정보' | '일정정보' | '결제정보' | '계약정보' | '기타'
export type VariableScope = 'customer' | 'application'

/**
 * 문자알림 관리 탭 종류.
 * Phase 27-AO: 이번달일정을 유형별로 분리 (monthly_schedule → deep / end 2개).
 * 정기딥과 정기엔드가 각자 다른 dropdown 리스트를 가져야 하므로 관리 컨텍스트도 5개.
 */
export type TemplateTab =
  | '1회성케어'
  | '정기딥케어'
  | '정기엔드케어'
  | 'monthly_schedule_deep'
  | 'monthly_schedule_end'
  | '기타'

export interface VariableDef {
  label: string           // {{업체명}}의 "업체명"
  category: VariableCategory
  scope: VariableScope    // 어느 데이터 소스에서 뽑는가
  /** 이 변수가 노출되는 탭 목록. 생략 시 모든 탭에 노출. */
  appliesTo?: TemplateTab[]
  /** 자연어 설명 (툴팁·미리보기용) */
  desc: string
  /** context 객체에서 값 추출 (renderer가 호출) */
  resolve: (ctx: NotificationContext) => string | number | null | undefined
}

/**
 * 발송 시점의 컨텍스트 (customer + application + schedule 병합).
 * application 알림도 customer 정보 필요할 수 있어 두 스코프 모두 옵션.
 * 각 필드는 실제 DB 컬럼 이름을 그대로 사용 → 라우트에서 select('*') 결과 그대로 전달 가능.
 */
export interface NotificationContext {
  customer?: {
    // 일반정보
    business_name?: string | null
    business_number?: string | null
    contact_name?: string | null
    contact_phone?: string | null
    contact_phone_2?: string | null
    email?: string | null
    address?: string | null
    address_detail?: string | null
    // 결제정보
    payment_method?: string | null
    account_number?: string | null
    unit_price?: number | null
    supply_amount?: number | null
    vat?: number | null
    deposit?: number | null
    balance?: number | null
    deposit_payment_url?: string | null
    balance_payment_url?: string | null
    billing_card_url?: string | null
    // 계약정보 (정기)
    billing_cycle?: string | null
    billing_amount?: number | null
    billing_start_date?: string | null
    billing_next_date?: string | null
    billing_day?: number | null
    contract_start_date?: string | null
    contract_end_date?: string | null
    contract_drive_url?: string | null
    payment_date?: number | null
    // 일정정보
    next_visit_date?: string | null
    visit_interval_days?: number | null
    visit_monthly_count?: string | null
    injection_cycle_months?: string | null
    visit_weekdays?: string[] | null
    business_hours_start?: string | null
    business_hours_end?: string | null
    meeting_time?: string | null
    construction_time?: string | null
    // 기타 (현장 정보)
    care_scope?: string | null
    door_password?: string | null
    parking_info?: string | null
    gas_location?: string | null
    power_location?: string | null
    elevator?: string | null
    building_access?: string | null
    access_method?: string | null
    special_notes?: string | null
    drive_folder_url?: string | null
  } | null
  application?: {
    // 일반정보
    business_name?: string | null
    business_number?: string | null
    owner_name?: string | null
    phone?: string | null
    phone_2?: string | null
    email?: string | null
    address?: string | null
    // 일정정보
    construction_date?: string | null
    construction_time?: string | null
    business_hours_start?: string | null
    business_hours_end?: string | null
    pre_meeting_at?: string | null
    meeting_time?: string | null
    // 결제정보
    payment_method?: string | null
    account_number?: string | null
    supply_amount?: number | null
    vat?: number | null
    deposit?: number | null
    balance?: number | null
    deposit_payment_url?: string | null
    balance_payment_url?: string | null
    virtual_account_number?: string | null
    virtual_account_bank?: string | null
    // 기타 (현장 정보)
    care_scope?: string | null
    space_size?: string | null
    parking?: string | null
    elevator?: string | null
    building_access?: string | null
    access_method?: string | null
    drive_folder_url?: string | null
    request_notes?: string | null
  } | null
  /** 이번달 일정(service_schedules) — 회차별 시공/결제 정보 */
  schedule?: {
    scheduled_date?: string | null
    scheduled_time_start?: string | null
    scheduled_time_end?: string | null
    payment_amount?: number | null
    payment_date?: string | null
    worker_memo?: string | null
  } | null
  /** 기타 탭 전용 — 견적서/계약서/급여/출퇴근 */
  extra?: {
    quote_no?: string | null
    quote_total?: string | null
    quote_valid_until?: string | null
    quote_pdf_url?: string | null
    contract_no?: string | null
    contract_pdf_url?: string | null
    payroll_month?: string | null
    payroll_amount?: string | null
    payroll_date?: string | null
    worker_name?: string | null
    checkin_expected?: string | null
    checkin_status?: string | null
    late_minutes?: string | null
  } | null
}

// ─── 값 포맷터 ────────────────────────────────────────
function fmtDate(d: string | null | undefined): string {
  if (!d) return ''
  const s = d.slice(0, 10)
  const [y, m, day] = s.split('-')
  return `${y}.${m}.${day}`
}
function fmtDateTime(dt: string | null | undefined): string {
  if (!dt) return ''
  const s = dt.slice(0, 16).replace('T', ' ')
  return s
}
function fmtTime(t: string | null | undefined): string {
  if (!t) return ''
  return t.slice(0, 5)
}
function fmtMoney(n: number | null | undefined): string {
  if (n == null) return ''
  return n.toLocaleString('ko-KR')
}
function fmtWeekdays(days: string[] | null | undefined): string {
  if (!days || days.length === 0) return ''
  return days.join(',')
}
function isNoVat(method: string | null | undefined): boolean {
  if (!method) return false
  return method.includes('비과세') || method === '현금(부가세 X)' || method === '카드(온라인 간편결제)' || method === '플랫폼'
}

/**
 * 자연어 라벨 순서대로 정의. UI 팔레트도 이 순서로 노출.
 *
 * appliesTo 규칙:
 *   - '1회성케어'     : 단발성 신청서 기반 알림 (customers.customer_type='1회성케어')
 *   - '정기딥케어'    : 정기 딥클리닝 계약 기반 알림
 *   - '정기엔드케어'  : 정기 엔드클리닝 계약 기반 알림
 *   - 'monthly_schedule' : 이번달 일정 개별 회차 알림 (service_schedules)
 *
 * 필드가 새로 추가되면 이 리스트에 항목을 추가하고 appliesTo에 관련 탭을 명시하면
 * 문자알림 관리 페이지 팔레트가 자동 갱신됨.
 */
// Phase 27-AO: 이번달일정 탭이 정기딥/정기엔드로 분리됨. 팔레트 노출은 두 유형에 동일하게 적용.
const TAB_ALL: TemplateTab[] = ['1회성케어', '정기딥케어', '정기엔드케어', 'monthly_schedule_deep', 'monthly_schedule_end', '기타']
const TAB_ONESHOT_MONTHLY: TemplateTab[] = ['1회성케어', 'monthly_schedule_deep', 'monthly_schedule_end']
const TAB_NON_MONTHLY: TemplateTab[] = ['1회성케어', '정기딥케어', '정기엔드케어']
const TAB_RECURRING: TemplateTab[] = ['정기딥케어', '정기엔드케어']
const TAB_MONTHLY: TemplateTab[] = ['monthly_schedule_deep', 'monthly_schedule_end']

export const AVAILABLE_VARIABLES: VariableDef[] = [
  // ══════ 일반정보 (모든 탭 공통) ══════
  { label: '업체명', category: '일반정보', scope: 'customer', appliesTo: TAB_ALL,
    desc: '고객 사업장명',
    resolve: (c) => c.application?.business_name ?? c.customer?.business_name ?? '' },
  { label: '사업자번호', category: '일반정보', scope: 'customer', appliesTo: TAB_ALL,
    desc: '사업자 등록번호',
    resolve: (c) => c.application?.business_number ?? c.customer?.business_number ?? '' },
  { label: '고객명', category: '일반정보', scope: 'customer', appliesTo: TAB_ALL,
    desc: '담당자 이름',
    resolve: (c) => c.application?.owner_name ?? c.customer?.contact_name ?? '' },
  { label: '연락처', category: '일반정보', scope: 'customer', appliesTo: TAB_ALL,
    desc: '고객 대표 전화번호',
    resolve: (c) => c.application?.phone ?? c.customer?.contact_phone ?? '' },
  { label: '추가연락처', category: '일반정보', scope: 'customer', appliesTo: TAB_ALL,
    desc: '보조 전화번호',
    resolve: (c) => c.application?.phone_2 ?? c.customer?.contact_phone_2 ?? '' },
  { label: '이메일', category: '일반정보', scope: 'customer', appliesTo: TAB_ALL,
    desc: '고객 이메일',
    resolve: (c) => c.application?.email ?? c.customer?.email ?? '' },
  { label: '주소', category: '일반정보', scope: 'customer', appliesTo: TAB_ALL,
    desc: '시공/방문 주소',
    resolve: (c) => c.application?.address ?? c.customer?.address ?? '' },
  { label: '상세주소', category: '일반정보', scope: 'customer', appliesTo: TAB_ALL,
    desc: '동/호수 등 상세 주소',
    resolve: (c) => c.customer?.address_detail ?? '' },

  // ══════ 일정정보 ══════
  // 시공일자·시공시간: 회차별 정보 → 1회성/월간에서 유효
  { label: '시공일자', category: '일정정보', scope: 'application', appliesTo: TAB_ONESHOT_MONTHLY,
    desc: '방문/시공 예정일 (YYYY.MM.DD)',
    resolve: (c) => fmtDate(c.schedule?.scheduled_date ?? c.application?.construction_date ?? c.customer?.next_visit_date) },
  { label: '시공시간', category: '일정정보', scope: 'application', appliesTo: TAB_ONESHOT_MONTHLY,
    desc: '방문/시공 예정 시각 (HH:MM)',
    resolve: (c) => fmtTime(c.schedule?.scheduled_time_start ?? c.application?.construction_time ?? c.customer?.construction_time) },
  { label: '시공종료시간', category: '일정정보', scope: 'application', appliesTo: TAB_MONTHLY,
    desc: '개별 회차 종료 예정 시각',
    resolve: (c) => fmtTime(c.schedule?.scheduled_time_end) },
  // 다음방문일: 정기 계약에서만 의미
  { label: '다음방문일', category: '일정정보', scope: 'customer', appliesTo: TAB_RECURRING,
    desc: '정기 다음 방문 예정일',
    resolve: (c) => fmtDate(c.customer?.next_visit_date) },
  // 영업시간: 방문 시 참고용 (모든 탭)
  { label: '영업시작시간', category: '일정정보', scope: 'customer', appliesTo: TAB_ALL,
    desc: '고객 사업장 개점 시각',
    resolve: (c) => fmtTime(c.application?.business_hours_start ?? c.customer?.business_hours_start) },
  { label: '영업종료시간', category: '일정정보', scope: 'customer', appliesTo: TAB_ALL,
    desc: '고객 사업장 마감 시각',
    resolve: (c) => fmtTime(c.application?.business_hours_end ?? c.customer?.business_hours_end) },
  // 정기 방문 스케줄
  { label: '방문요일', category: '일정정보', scope: 'customer', appliesTo: TAB_RECURRING,
    desc: '정기 방문 요일 (월,수,금 등)',
    resolve: (c) => fmtWeekdays(c.customer?.visit_weekdays) },
  { label: '월방문횟수', category: '일정정보', scope: 'customer', appliesTo: TAB_RECURRING,
    desc: '한 달 방문 횟수',
    resolve: (c) => c.customer?.visit_monthly_count ?? '' },
  { label: '방문주기', category: '일정정보', scope: 'customer', appliesTo: TAB_RECURRING,
    desc: '방문 간격 (일)',
    resolve: (c) => c.customer?.visit_interval_days != null ? `${c.customer.visit_interval_days}일` : '' },
  { label: '투입주기', category: '일정정보', scope: 'customer', appliesTo: TAB_RECURRING,
    desc: '월/개월 단위 투입 주기',
    resolve: (c) => c.customer?.injection_cycle_months ?? '' },
  // 사전미팅 (1회성)
  { label: '사전미팅시각', category: '일정정보', scope: 'application', appliesTo: ['1회성케어'],
    desc: '사전 방문미팅 예정 시각',
    resolve: (c) => fmtDateTime(c.application?.pre_meeting_at) },
  { label: '미팅시간', category: '일정정보', scope: 'customer', appliesTo: TAB_ALL,
    desc: '사전 미팅 표시용 문구',
    resolve: (c) => c.application?.meeting_time ?? c.customer?.meeting_time ?? '' },

  // ══════ 결제정보 ══════
  { label: '결제방법', category: '결제정보', scope: 'customer', appliesTo: TAB_ALL,
    desc: '현금·카드·플랫폼 등',
    resolve: (c) => c.application?.payment_method ?? c.customer?.payment_method ?? '' },
  { label: '계좌번호', category: '결제정보', scope: 'customer', appliesTo: TAB_ALL,
    desc: '입금받을 계좌 (환급·페이백)',
    resolve: (c) => c.application?.account_number ?? c.customer?.account_number ?? '' },
  // 공급가액·부가세·총액·예약금·잔금 = 1회성/월간 회차별 결제
  { label: '공급가액', category: '결제정보', scope: 'application', appliesTo: TAB_NON_MONTHLY,
    desc: '부가세 제외 금액',
    resolve: (c) => fmtMoney(c.application?.supply_amount ?? c.customer?.supply_amount) },
  { label: '부가세', category: '결제정보', scope: 'application', appliesTo: TAB_NON_MONTHLY,
    desc: '10% 부가세 (비과세 시 0)',
    resolve: (c) => {
      const pm = c.application?.payment_method ?? c.customer?.payment_method
      return isNoVat(pm) ? '0' : fmtMoney(c.application?.vat ?? c.customer?.vat)
    } },
  { label: '총액', category: '결제정보', scope: 'application', appliesTo: TAB_NON_MONTHLY,
    desc: '공급가액 + 부가세',
    resolve: (c) => {
      const s = Number(c.application?.supply_amount ?? c.customer?.supply_amount ?? 0)
      const pm = c.application?.payment_method ?? c.customer?.payment_method
      const v = isNoVat(pm) ? 0 : Number(c.application?.vat ?? c.customer?.vat ?? 0)
      return fmtMoney(s + v)
    } },
  { label: '예약금', category: '결제정보', scope: 'application', appliesTo: TAB_ONESHOT_MONTHLY,
    desc: '선입금 금액',
    resolve: (c) => fmtMoney(c.application?.deposit ?? c.customer?.deposit) },
  { label: '잔금', category: '결제정보', scope: 'application', appliesTo: TAB_ONESHOT_MONTHLY,
    desc: '자동계산: 총액-예약금',
    resolve: (c) => fmtMoney(c.application?.balance ?? c.customer?.balance) },
  { label: '회차결제금액', category: '결제정보', scope: 'application', appliesTo: TAB_MONTHLY,
    desc: '이번 회차 청구 금액',
    resolve: (c) => fmtMoney(c.schedule?.payment_amount) },
  { label: '단가', category: '결제정보', scope: 'customer', appliesTo: TAB_RECURRING,
    desc: '회당 단가',
    resolve: (c) => fmtMoney(c.customer?.unit_price) },
  // 결제 URL
  { label: '예약금결제URL', category: '결제정보', scope: 'application', appliesTo: TAB_ONESHOT_MONTHLY,
    desc: 'PG 예약금 결제 링크',
    resolve: (c) => c.application?.deposit_payment_url ?? c.customer?.deposit_payment_url ?? '' },
  { label: '잔금결제URL', category: '결제정보', scope: 'application', appliesTo: TAB_ONESHOT_MONTHLY,
    desc: 'PG 잔금 결제 링크',
    resolve: (c) => c.application?.balance_payment_url ?? c.customer?.balance_payment_url ?? '' },
  { label: '카드등록URL', category: '결제정보', scope: 'customer', appliesTo: TAB_RECURRING,
    desc: '정기결제 카드 등록 링크',
    resolve: (c) => c.customer?.billing_card_url ?? '' },
  { label: '가상계좌은행', category: '결제정보', scope: 'application', appliesTo: TAB_ONESHOT_MONTHLY,
    desc: '입금 전용 가상계좌 은행명',
    resolve: (c) => c.application?.virtual_account_bank ?? '' },
  { label: '가상계좌번호', category: '결제정보', scope: 'application', appliesTo: TAB_ONESHOT_MONTHLY,
    desc: '입금 전용 가상계좌 번호',
    resolve: (c) => c.application?.virtual_account_number ?? '' },

  // ══════ 계약정보 (정기케어 전용) ══════
  { label: '계약금액', category: '계약정보', scope: 'customer', appliesTo: TAB_RECURRING,
    desc: '정기 계약 청구 금액 (월/연)',
    resolve: (c) => fmtMoney(c.customer?.billing_amount) },
  { label: '결제주기', category: '계약정보', scope: 'customer', appliesTo: TAB_RECURRING,
    desc: '월간/연간',
    resolve: (c) => c.customer?.billing_cycle ?? '' },
  { label: '계약시작일', category: '계약정보', scope: 'customer', appliesTo: TAB_RECURRING,
    desc: '계약 개시 날짜',
    resolve: (c) => fmtDate(c.customer?.contract_start_date) },
  { label: '계약만료일', category: '계약정보', scope: 'customer', appliesTo: TAB_RECURRING,
    desc: '계약 종료 예정일',
    resolve: (c) => fmtDate(c.customer?.contract_end_date) },
  { label: '결제시작일', category: '계약정보', scope: 'customer', appliesTo: TAB_RECURRING,
    desc: '정기결제 개시 날짜',
    resolve: (c) => fmtDate(c.customer?.billing_start_date) },
  { label: '다음결제일', category: '계약정보', scope: 'customer', appliesTo: TAB_RECURRING,
    desc: '다음 정기 결제 예정일',
    resolve: (c) => fmtDate(c.customer?.billing_next_date) },
  { label: '결제일자', category: '계약정보', scope: 'customer', appliesTo: TAB_RECURRING,
    desc: '매월 결제일 (1~31)',
    resolve: (c) => c.customer?.payment_date != null ? `${c.customer.payment_date}일` : '' },
  { label: '매월결제일', category: '계약정보', scope: 'customer', appliesTo: TAB_RECURRING,
    desc: '자동결제 트리거 일자',
    resolve: (c) => c.customer?.billing_day != null ? `${c.customer.billing_day}일` : '' },
  { label: '계약서URL', category: '계약정보', scope: 'customer', appliesTo: TAB_RECURRING,
    desc: '계약서 드라이브 링크',
    resolve: (c) => c.customer?.contract_drive_url ?? '' },

  // ══════ 기타 (현장 정보) ══════
  { label: '케어범위', category: '기타', scope: 'application', appliesTo: TAB_ALL,
    desc: '시공 범위 자유 서술',
    resolve: (c) => c.application?.care_scope ?? c.customer?.care_scope ?? '' },
  { label: '공간규모', category: '기타', scope: 'application', appliesTo: ['1회성케어'],
    desc: '평수·객장 크기',
    resolve: (c) => c.application?.space_size ?? '' },
  { label: '출입비번', category: '기타', scope: 'customer', appliesTo: TAB_ALL,
    desc: '현장 도어락 비밀번호',
    resolve: (c) => c.customer?.door_password ?? '' },
  { label: '주차정보', category: '기타', scope: 'customer', appliesTo: TAB_ALL,
    desc: '주차 안내 (customers)',
    resolve: (c) => c.customer?.parking_info ?? c.application?.parking ?? '' },
  { label: '엘리베이터', category: '기타', scope: 'customer', appliesTo: TAB_ALL,
    desc: '엘리베이터 유무/사용법',
    resolve: (c) => c.application?.elevator ?? c.customer?.elevator ?? '' },
  { label: '건물출입', category: '기타', scope: 'customer', appliesTo: TAB_ALL,
    desc: '건물 출입 방법',
    resolve: (c) => c.application?.building_access ?? c.customer?.building_access ?? '' },
  { label: '출입방법', category: '기타', scope: 'customer', appliesTo: TAB_ALL,
    desc: '내부 출입 방법',
    resolve: (c) => c.application?.access_method ?? c.customer?.access_method ?? '' },
  { label: '가스위치', category: '기타', scope: 'customer', appliesTo: TAB_ALL,
    desc: '가스 밸브 위치',
    resolve: (c) => c.customer?.gas_location ?? '' },
  { label: '전원위치', category: '기타', scope: 'customer', appliesTo: TAB_ALL,
    desc: '전원 콘센트 위치',
    resolve: (c) => c.customer?.power_location ?? '' },
  { label: '특이사항', category: '기타', scope: 'customer', appliesTo: TAB_ALL,
    desc: '현장 특이사항 메모',
    resolve: (c) => c.customer?.special_notes ?? '' },
  { label: '고객요청사항', category: '기타', scope: 'application', appliesTo: TAB_ONESHOT_MONTHLY,
    desc: '고객이 남긴 요청/메모',
    resolve: (c) => c.application?.request_notes ?? '' },
  { label: '사진드라이브', category: '기타', scope: 'customer', appliesTo: TAB_ALL,
    desc: '작업 사진 구글드라이브 링크',
    resolve: (c) => c.application?.drive_folder_url ?? c.customer?.drive_folder_url ?? '' },

  // ══════ 기타 탭 전용 변수 ══════
  // 견적관련
  { label: '견적서번호', category: '기타', scope: 'application', appliesTo: ['기타'],
    desc: '견적서 고유 번호',
    resolve: (c) => c.extra?.quote_no ?? '' },
  { label: '견적총액', category: '결제정보', scope: 'application', appliesTo: ['기타'],
    desc: '견적서 총 금액 (포맷 포함)',
    resolve: (c) => c.extra?.quote_total ?? '' },
  { label: '견적유효기간', category: '기타', scope: 'application', appliesTo: ['기타'],
    desc: '견적서 유효 만료일',
    resolve: (c) => c.extra?.quote_valid_until ?? '' },
  { label: '견적서링크', category: '기타', scope: 'application', appliesTo: ['기타'],
    desc: '견적서 PDF 링크',
    resolve: (c) => c.extra?.quote_pdf_url ?? '' },

  // 계약서관련
  { label: '계약서번호', category: '계약정보', scope: 'customer', appliesTo: ['기타'],
    desc: '계약서 고유 번호',
    resolve: (c) => c.extra?.contract_no ?? '' },
  { label: '계약서PDF링크', category: '계약정보', scope: 'customer', appliesTo: ['기타'],
    desc: '계약서 PDF 다운로드 링크',
    resolve: (c) => c.extra?.contract_pdf_url ?? '' },

  // 급여관련
  { label: '급여월', category: '기타', scope: 'application', appliesTo: ['기타'],
    desc: '급여 지급 대상 월 (예: 2026년 8월)',
    resolve: (c) => c.extra?.payroll_month ?? '' },
  { label: '지급총액', category: '결제정보', scope: 'application', appliesTo: ['기타'],
    desc: '실수령 급여 총액',
    resolve: (c) => c.extra?.payroll_amount ?? '' },
  { label: '지급일', category: '기타', scope: 'application', appliesTo: ['기타'],
    desc: '급여 지급 예정일',
    resolve: (c) => c.extra?.payroll_date ?? '' },

  // 출퇴근관련
  { label: '직원명', category: '일반정보', scope: 'application', appliesTo: ['기타'],
    desc: '출퇴근 대상 직원 이름',
    resolve: (c) => c.extra?.worker_name ?? '' },
  { label: '출근예정시각', category: '일정정보', scope: 'application', appliesTo: ['기타'],
    desc: '출근 예정 시각',
    resolve: (c) => c.extra?.checkin_expected ?? '' },
  { label: '출근상태', category: '기타', scope: 'application', appliesTo: ['기타'],
    desc: '출근 상태 (지각/미출근 등)',
    resolve: (c) => c.extra?.checkin_status ?? '' },
  { label: '지각시간', category: '기타', scope: 'application', appliesTo: ['기타'],
    desc: '지각 경과 시간 (예: 30분)',
    resolve: (c) => c.extra?.late_minutes ?? '' },
]

/**
 * 라벨로 빠르게 찾기
 */
export const VARIABLES_BY_LABEL: Record<string, VariableDef> =
  Object.fromEntries(AVAILABLE_VARIABLES.map(v => [v.label, v]))

/**
 * 카테고리별로 그룹
 */
export function variablesByCategory(): Record<VariableCategory, VariableDef[]> {
  const grouped: Record<VariableCategory, VariableDef[]> = {
    '일반정보': [], '일정정보': [], '결제정보': [], '계약정보': [], '기타': [],
  }
  for (const v of AVAILABLE_VARIABLES) grouped[v.category].push(v)
  return grouped
}

/**
 * 특정 탭에서 사용 가능한 변수만 필터링하여 카테고리별로 그룹.
 * appliesTo가 없으면 모든 탭에 노출됨 (fallback).
 * 특정 카테고리에 해당 탭용 변수가 하나도 없으면 빈 배열 반환 → UI에서 자동 숨김 처리.
 */
export function variablesByCategoryForTab(tab: TemplateTab): Record<VariableCategory, VariableDef[]> {
  const grouped: Record<VariableCategory, VariableDef[]> = {
    '일반정보': [], '일정정보': [], '결제정보': [], '계약정보': [], '기타': [],
  }
  for (const v of AVAILABLE_VARIABLES) {
    const allowed = !v.appliesTo || v.appliesTo.includes(tab)
    if (allowed) grouped[v.category].push(v)
  }
  return grouped
}
