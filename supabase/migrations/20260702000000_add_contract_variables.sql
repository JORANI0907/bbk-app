-- contract_variables 테이블: 계약서 양식에 삽입 가능한 변수 카탈로그
-- 기존 하드코딩(TEMPLATE_KNOWN_VARS)을 DB로 이관하고, 관리자가 UI에서 커스텀 변수를 추가할 수 있도록 함
CREATE TABLE IF NOT EXISTS contract_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT DEFAULT '',
  mode TEXT NOT NULL CHECK (mode IN ('auto', 'manual')),
  auto_field TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_variables_sort ON contract_variables(sort_order, name);

-- 기존 TEMPLATE_KNOWN_VARS 21종을 시스템 변수로 seed (삭제 불가)
INSERT INTO contract_variables (name, label, description, mode, auto_field, is_system, sort_order) VALUES
  ('CONTRACT_YEAR', '계약 연도', '작성일 기준 연도', 'auto', 'system.today_year', true, 10),
  ('CONTRACT_MONTH', '계약 월', '작성일 기준 월', 'auto', 'system.today_month', true, 11),
  ('CONTRACT_DAY', '계약 일', '작성일 기준 일', 'auto', 'system.today_day', true, 12),
  ('CUSTOMER_BUSINESS_NAME', '고객사명', '고객사 상호', 'auto', 'customer.business_name', true, 20),
  ('CUSTOMER_BUSINESS_NUMBER', '사업자번호', '고객사 사업자등록번호', 'auto', 'customer.business_number', true, 21),
  ('CUSTOMER_OWNER_NAME', '담당자명', '고객측 담당자 이름', 'auto', 'customer.contact_name', true, 22),
  ('CUSTOMER_PHONE', '전화번호', '담당자 연락처', 'auto', 'customer.contact_phone', true, 23),
  ('CUSTOMER_EMAIL', '이메일', '담당자 이메일', 'auto', 'customer.email', true, 24),
  ('CUSTOMER_ADDRESS', '주소', '고객사 주소', 'auto', 'customer.address', true, 25),
  ('MONTHLY_PRICE', '월 요금', '월 청구 금액', 'auto', 'contract.monthly_price', true, 30),
  ('ANNUAL_PRICE', '연간 요금', '연간 총 청구 금액', 'auto', 'contract.annual_price', true, 31),
  ('CONTRACT_START_DATE', '계약 시작일', '계약 개시일', 'auto', 'contract.start_date', true, 32),
  ('CONTRACT_END_DATE', '계약 종료일', '계약 만료일', 'auto', 'contract.end_date', true, 33),
  ('SERVICE_SCOPE', '서비스 범위', '수동 입력 — 서비스 범위 서술', 'manual', NULL, true, 40),
  ('SELECTED_ITEMS_LIST', '서비스 항목 (HTML 목록)', '선택된 서비스 항목 자동 렌더링', 'auto', 'contract.selected_items_list', true, 41),
  ('CUSTOMER_SIGNATURE', '고객 서명', '고객 전자서명 이미지', 'auto', 'signing.customer_signature', true, 50),
  ('ADMIN_SIGNATURE', '관리자 서명', '관리자 전자서명 이미지', 'auto', 'signing.admin_signature', true, 51),
  ('CUSTOMER_SIGNER_NAME', '고객 서명자 성명', '고객 서명 시 입력', 'auto', 'signing.customer_signer_name', true, 52),
  ('CUSTOMER_STAMP', '고객사 직인', '고객 서명 시 업로드', 'auto', 'signing.customer_stamp', true, 53),
  ('SUPPLIER_STAMP', '공급사 직인', '관리자 최종 확인 시 업로드', 'auto', 'signing.supplier_stamp', true, 54)
ON CONFLICT (name) DO NOTHING;
