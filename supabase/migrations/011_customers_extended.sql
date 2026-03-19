-- BBK Korea: customers 테이블 고객관리 확장 컬럼 추가
-- 고객관리 탭에 필요한 필드 추가

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS account_number TEXT,
  ADD COLUMN IF NOT EXISTS platform_nickname TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS elevator TEXT,
  ADD COLUMN IF NOT EXISTS building_access TEXT,
  ADD COLUMN IF NOT EXISTS access_method TEXT,
  ADD COLUMN IF NOT EXISTS business_hours_start TEXT,
  ADD COLUMN IF NOT EXISTS business_hours_end TEXT,
  ADD COLUMN IF NOT EXISTS care_scope TEXT,
  -- 고객 유형: 1회성케어 / 정기딥케어 / 정기엔드케어
  ADD COLUMN IF NOT EXISTS customer_type TEXT
    CHECK (customer_type IN ('1회성케어', '정기딥케어', '정기엔드케어')),
  -- 계약 상태: active / paused / terminated
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'terminated')),
  -- 청구 주기: 월간 / 연간
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT
    CHECK (billing_cycle IN ('월간', '연간')),
  ADD COLUMN IF NOT EXISTS billing_amount BIGINT,
  ADD COLUMN IF NOT EXISTS billing_start_date DATE,
  ADD COLUMN IF NOT EXISTS billing_next_date DATE,
  ADD COLUMN IF NOT EXISTS contract_start_date DATE,
  ADD COLUMN IF NOT EXISTS contract_end_date DATE,
  ADD COLUMN IF NOT EXISTS unit_price BIGINT,
  ADD COLUMN IF NOT EXISTS visit_interval_days INTEGER,
  ADD COLUMN IF NOT EXISTS next_visit_date DATE,
  ADD COLUMN IF NOT EXISTS notes TEXT;
