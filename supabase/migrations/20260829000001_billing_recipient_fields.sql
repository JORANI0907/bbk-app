-- 결제자(수취인) 정보와 서비스 수령자 정보 분리
--
-- 배경: 프랜차이즈 본사가 결제/세금계산서 수취, 실제 서비스는 지점에서 받는 케이스 등
-- 결제자와 수령자가 다른 경우가 늘어남. customers 테이블 일반정보 필드는 서비스 수령자
-- 기준으로 유지하고, 결제 전용 필드를 별도로 추가하여 세금계산서·이체 정보 파싱 시
-- 결제 필드 우선 참조하도록 한다.
--
-- 정책:
--   billing_* 필드가 NULL 이면 세금계산서 로직이 일반 필드(contact_name/email/address/business_number)로
--   fallback. 프론트에서 결제정보 섹션 표시 시에도 NULL 이면 일반정보 값을 initial 로 표시.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS billing_contact_name    text,
  ADD COLUMN IF NOT EXISTS billing_email           text,
  ADD COLUMN IF NOT EXISTS billing_address         text,
  ADD COLUMN IF NOT EXISTS billing_business_number text;

COMMENT ON COLUMN customers.billing_contact_name    IS '결제자 대표자 성함 (비어있으면 contact_name 사용)';
COMMENT ON COLUMN customers.billing_email           IS '결제자 이메일 (비어있으면 email 사용)';
COMMENT ON COLUMN customers.billing_address         IS '결제자 주소 (비어있으면 address 사용)';
COMMENT ON COLUMN customers.billing_business_number IS '결제자 사업자번호 (비어있으면 business_number 사용)';


-- 예약금 이체 완료 처리용 컬럼 (service_applications 1회성 회차 단위)
--   deposit_transferred_at: 관리자가 [이체완료] 버튼으로 처리한 시각.
--   NULL 이면 미이체. 취소 시 다시 NULL 로 되돌림.
ALTER TABLE service_applications
  ADD COLUMN IF NOT EXISTS deposit_transferred_at timestamptz;

COMMENT ON COLUMN service_applications.deposit_transferred_at IS '예약금 이체 완료 시각 (관리자 [이체완료] 버튼)';

CREATE INDEX IF NOT EXISTS idx_service_apps_deposit_transferred_at
  ON service_applications(deposit_transferred_at)
  WHERE deposit_transferred_at IS NOT NULL AND deleted_at IS NULL;
