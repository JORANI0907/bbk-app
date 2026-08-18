-- 특정 고객에게 자동 알림 전면 중단 옵션
-- 예: 월말 일괄 정산 방식으로 별도 관리하는 고객
-- status='paused' 와 다르게 서비스는 정상 운영, 알림만 발송 중단

ALTER TABLE customers
  ADD COLUMN auto_notification_paused BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN auto_notification_pause_reason TEXT;

CREATE INDEX idx_customers_auto_notification_paused
  ON customers(auto_notification_paused)
  WHERE auto_notification_paused = true;

COMMENT ON COLUMN customers.auto_notification_paused
  IS '자동 알림 전면 중단 여부 (모든 크론 알림 대상에서 제외). status=paused 와 다르게 서비스는 정상 운영.';
COMMENT ON COLUMN customers.auto_notification_pause_reason
  IS '알림 중단 사유 (선택). UI 주석으로 표시.';
