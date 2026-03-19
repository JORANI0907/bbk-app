-- 담당자 건당 실지급액 컬럼 추가 (비워두면 unit_price_per_visit 기준)
ALTER TABLE service_applications
  ADD COLUMN IF NOT EXISTS manager_pay INTEGER;

COMMENT ON COLUMN service_applications.manager_pay
  IS '담당자 건당 실지급액 (비워두면 unit_price_per_visit 기준으로 자동 산정)';

-- 월별 급여 정산 기록 테이블
CREATE TABLE IF NOT EXISTS payroll_records (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month    TEXT    NOT NULL,                    -- 'YYYY-MM'
  person_type   TEXT    NOT NULL CHECK (person_type IN ('user', 'worker')),
  person_id     UUID    NOT NULL,                    -- users.id 또는 workers.id
  auto_amount   INTEGER NOT NULL DEFAULT 0,          -- 자동 계산 금액
  final_amount  INTEGER,                             -- 최종 지급액 (null이면 auto_amount 사용)
  note          TEXT,
  is_paid       BOOLEAN NOT NULL DEFAULT false,
  paid_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(year_month, person_type, person_id)
);

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_payroll_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payroll_records_updated_at ON payroll_records;
CREATE TRIGGER payroll_records_updated_at
  BEFORE UPDATE ON payroll_records
  FOR EACH ROW EXECUTE FUNCTION update_payroll_records_updated_at();
