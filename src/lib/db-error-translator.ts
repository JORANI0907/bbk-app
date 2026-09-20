// Supabase/PostgreSQL 에러 메시지를 사용자 UI 라벨 기준 한글로 변환.
//
// 목적: 관리자·직원 화면에 노출되는 에러가 "null value in column ..." 같은 영문
// 컬럼명이 아닌 "주소를 입력해주세요" 같은 실제 UI 라벨로 나오도록 매핑.
//
// 사용: API route 에서 supabase.insert/update 후 error 발생 시
//   return NextResponse.json({ error: translateDbError(error.message) }, { status: 500 })
//
// 매핑에 없는 컬럼은 원문 그대로 표시 (안전빵).

// 컬럼명 → UI 라벨 매핑. UI 폼 라벨과 일치하도록 관리.
const COLUMN_LABEL: Record<string, string> = {
  // customers
  business_name: '업체명',
  contact_name: '고객명',
  contact_phone: '연락처',
  contact_phone_2: '추가번호',
  email: '이메일',
  address: '주소',
  business_number: '사업자번호',
  account_number: '계좌번호',
  customer_type: '고객 유형',
  status: '상태',
  payment_method: '결제방법',
  billing_cycle: '결제 주기',
  billing_amount: '결제 금액',
  contract_start_date: '계약 시작일',
  contract_end_date: '계약 종료일',
  next_visit_date: '시공일자',
  construction_time: '시공시간',
  supply_amount: '공급가액',
  vat: '부가세',
  deposit: '예약금',
  balance: '잔금',
  care_scope: '케어범위',
  disposition: '성향',
  grade: '등급',
  assigned_user_id: '담당자',
  billing_contact_name: '결제자 대표자',
  billing_email: '결제자 이메일',
  billing_address: '결제자 주소',
  billing_business_number: '결제자 사업자번호',
  // service_applications 공통 필드
  owner_name: '대표자명',
  phone: '연락처',
  construction_date: '시공일자',
  service_type: '서비스 유형',
  assigned_to: '담당자',
}

function labelOf(col: string): string {
  return COLUMN_LABEL[col] ?? col
}

export function translateDbError(rawMessage: string): string {
  const msg = rawMessage ?? ''

  // NOT NULL 위반: 특정 필드 미입력
  const notNull = msg.match(/null value in column "([^"]+)"/i)
  if (notNull) {
    return `${labelOf(notNull[1])} 을(를) 입력해주세요.`
  }

  // 유니크 제약 위반: 중복 값
  const uniq = msg.match(/duplicate key value violates unique constraint[^"]*"([^"]+)"/i)
  if (uniq) {
    return `이미 등록된 값입니다. (${uniq[1]})`
  }

  // 컬럼 미존재: 마이그레이션 지연/스키마 캐시 문제
  const noCol = msg.match(/could not find the '([^']+)' column/i)
  if (noCol) {
    return `${labelOf(noCol[1])} 필드가 아직 서버에 반영되지 않았습니다. 잠시 후 다시 시도해주세요.`
  }

  // 외래키 위반
  if (/violates foreign key constraint/i.test(msg)) {
    return '연결된 다른 데이터가 없어 저장할 수 없습니다.'
  }

  // 값 길이 초과
  const tooLong = msg.match(/value too long for type[^(]*\(([^)]+)\)/i)
  if (tooLong) {
    return `입력값이 너무 깁니다. (${tooLong[1]})`
  }

  // 체크 제약 위반
  if (/violates check constraint/i.test(msg)) {
    return '입력값이 허용되지 않는 형식입니다.'
  }

  // 매핑 없음 → 원문 노출 (디버깅용)
  return msg
}
