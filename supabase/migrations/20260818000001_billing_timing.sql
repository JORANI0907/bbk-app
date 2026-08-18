-- 후납(postpaid) 결제 방식 지원
-- customers.billing_timing : 고객별 기본 결제 방식 (선납/후납)
-- service_billings.billing_timing : 개별 청구 스냅샷 (고객 정책 변경 후에도 이력 보존)
-- 기본값 'prepaid' 로 기존 데이터 회귀 방지

ALTER TABLE customers
  ADD COLUMN billing_timing TEXT NOT NULL DEFAULT 'prepaid'
    CHECK (billing_timing IN ('prepaid', 'postpaid'));

ALTER TABLE service_billings
  ADD COLUMN billing_timing TEXT NOT NULL DEFAULT 'prepaid'
    CHECK (billing_timing IN ('prepaid', 'postpaid'));

CREATE INDEX idx_service_billings_timing ON service_billings(billing_timing);

COMMENT ON COLUMN customers.billing_timing IS '결제 방식 기본값: prepaid(선납, 서비스 사이클과 동월 결제) / postpaid(후납, 사이클 종료일 결제)';
COMMENT ON COLUMN service_billings.billing_timing IS '이 청구가 생성될 당시의 결제 방식 스냅샷';
