-- 청구 건별 마지막 알림 발송 시각 추적 (중복 발송 방지)
ALTER TABLE service_billings ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_billings_notify ON service_billings(last_notified_at)
  WHERE status != 'paid';
