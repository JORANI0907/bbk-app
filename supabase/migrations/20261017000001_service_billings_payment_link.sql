-- Phase H.0 (2026-10-17): service_billings 에 결제링크·발송추적 컬럼 추가
-- 정기 결제 자동 생성 cron 및 결제 안내 발송 cron 지원용
--
-- 신규 컬럼:
--   payment_url           TEXT       — PortOne 결제 링크 (고객에게 SMS로 발송)
--   payment_portone_id    TEXT       — PortOne payment ID (webhook Transaction.Paid 매칭용)
--   payment_sent_at       TIMESTAMPTZ — 결제 안내 SMS 마지막 발송 시각 (격일 간격 판단)
--   payment_method_snapshot TEXT     — 결제 생성 시점 결제방식 (거래처 결제방식 바뀌어도 과거 기록 보존)
--   send_attempts         INTEGER    — 결제 안내 발송 횟수 (최대치 초과 시 자동 중단)

ALTER TABLE service_billings
  ADD COLUMN IF NOT EXISTS payment_url             TEXT,
  ADD COLUMN IF NOT EXISTS payment_portone_id      TEXT,
  ADD COLUMN IF NOT EXISTS payment_sent_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_method_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS send_attempts           INTEGER DEFAULT 0;

-- webhook 매칭 (paymentId → service_billings 1건) 성능용 인덱스
CREATE INDEX IF NOT EXISTS idx_billings_payment_portone_id
  ON service_billings (payment_portone_id)
  WHERE payment_portone_id IS NOT NULL;

-- cron billing-send-link 가 "오늘 발송 대상" 조회할 때 성능용
CREATE INDEX IF NOT EXISTS idx_billings_pending_due
  ON service_billings (status, due_date)
  WHERE status = 'pending';

COMMENT ON COLUMN service_billings.payment_url IS 'Phase H: PortOne 결제 링크 (고객 SMS 발송용)';
COMMENT ON COLUMN service_billings.payment_portone_id IS 'Phase H: PortOne payment ID (webhook 매칭)';
COMMENT ON COLUMN service_billings.payment_sent_at IS 'Phase H: 결제 안내 마지막 발송 시각';
COMMENT ON COLUMN service_billings.send_attempts IS 'Phase H: 발송 누적 횟수 (최대치 초과 시 자동 중단)';
