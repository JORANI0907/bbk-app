-- ============================================================
-- BBK: 방문주기 통합 + 청구이력 확장
-- 목적: 분산된 방문주기 컬럼을 단일 구조로 통합하고
--       service_billings에 방문 연결 및 1회성 타입 지원 추가
-- 원칙: 기존 컬럼은 유지 (코드 전환 완료 후 038에서 제거)
-- ============================================================

-- 1. customers: 방문주기 통합 컬럼 추가
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS visit_cycle_unit TEXT
    CHECK (visit_cycle_unit IN ('day', 'week', 'month', 'quarter', 'year')),
  ADD COLUMN IF NOT EXISTS visit_cycle_value INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS visit_cycle_config JSONB DEFAULT '{}';

-- 2. 기존 데이터 → 새 컬럼으로 마이그레이션
-- 2-a. weekday 방식 → week 단위
UPDATE customers
SET
  visit_cycle_unit  = 'week',
  visit_cycle_value = CASE
    WHEN injection_cycle_months ~ '^\d+$' THEN injection_cycle_months::INTEGER
    ELSE 1
  END,
  visit_cycle_config = jsonb_build_object('weekdays', COALESCE(visit_weekdays, '{}'))
WHERE visit_schedule_type = 'weekday';

-- 2-b. monthly_date 방식 → month 단위
UPDATE customers
SET
  visit_cycle_unit  = 'month',
  visit_cycle_value = CASE
    WHEN injection_cycle_months ~ '^\d+$' THEN injection_cycle_months::INTEGER
    ELSE 1
  END,
  visit_cycle_config = jsonb_build_object('dates', COALESCE(visit_monthly_dates, '{}'))
WHERE visit_schedule_type = 'monthly_date';

-- 3. service_billings: 방문 연결 + 서비스 유형 컬럼 추가
ALTER TABLE service_billings
  ADD COLUMN IF NOT EXISTS schedule_id   UUID REFERENCES service_schedules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_type  TEXT,
  ADD COLUMN IF NOT EXISTS tax_invoice_issued      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tax_invoice_issued_date DATE;

-- 4. billing_type: 'onetime' 추가
ALTER TABLE service_billings
  DROP CONSTRAINT IF EXISTS service_billings_billing_type_check;
ALTER TABLE service_billings
  ADD CONSTRAINT service_billings_billing_type_check
    CHECK (billing_type IN ('monthly', 'annual', 'onetime'));

-- 5. 기존 billings에 service_type 백필
UPDATE service_billings sb
SET service_type = c.customer_type
FROM customers c
WHERE sb.customer_id = c.id
  AND sb.service_type IS NULL;

-- 6. 인덱스
CREATE INDEX IF NOT EXISTS idx_billings_schedule   ON service_billings(schedule_id);
CREATE INDEX IF NOT EXISTS idx_billings_service_type ON service_billings(service_type);
