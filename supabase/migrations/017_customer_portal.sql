-- 고객 요청사항 테이블
CREATE TABLE IF NOT EXISTS customer_requests (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  content     TEXT        NOT NULL,
  is_read     BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_requests_customer
  ON customer_requests(customer_id, created_at DESC);

-- 직원 특이사항 메모 고객 공개 여부
ALTER TABLE service_schedules
  ADD COLUMN IF NOT EXISTS memo_visible BOOLEAN NOT NULL DEFAULT false;
