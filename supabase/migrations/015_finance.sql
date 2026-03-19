-- users 테이블에 계좌번호 추가 (담당자 급여 지급용)
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_number TEXT;

-- 매출매입 수동 기록 테이블 (고정비 / 변동비)
CREATE TABLE IF NOT EXISTS finance_records (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month   TEXT        NOT NULL,
  category     TEXT        NOT NULL CHECK (category IN ('fixed', 'variable')),
  name         TEXT        NOT NULL,
  amount       BIGINT      NOT NULL DEFAULT 0,
  note         TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION update_finance_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS finance_records_updated_at ON finance_records;
CREATE TRIGGER finance_records_updated_at
  BEFORE UPDATE ON finance_records
  FOR EACH ROW EXECUTE FUNCTION update_finance_records_updated_at();

CREATE INDEX IF NOT EXISTS finance_records_year_month_idx ON finance_records(year_month);
