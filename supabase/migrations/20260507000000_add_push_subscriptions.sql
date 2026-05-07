-- 푸시 구독 저장 테이블
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL,
  user_type   TEXT NOT NULL CHECK (user_type IN ('admin', 'worker', 'customer')),
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  device_info JSONB DEFAULT '{}',
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

-- 발송 이력 테이블
CREATE TABLE IF NOT EXISTS push_notification_logs (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id UUID REFERENCES push_subscriptions(id) ON DELETE SET NULL,
  user_id         UUID,
  user_type       TEXT,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  url             TEXT,
  status          TEXT CHECK (status IN ('sent', 'failed', 'expired')) DEFAULT 'sent',
  error_message   TEXT,
  sent_at         TIMESTAMPTZ DEFAULT now()
);

-- RLS 활성화
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_notification_logs ENABLE ROW LEVEL SECURITY;

-- service role은 모두 허용
DROP POLICY IF EXISTS "service_role_all_push_subscriptions" ON push_subscriptions;
CREATE POLICY "service_role_all_push_subscriptions" ON push_subscriptions
  FOR ALL USING (true);

DROP POLICY IF EXISTS "service_role_all_push_logs" ON push_notification_logs;
CREATE POLICY "service_role_all_push_logs" ON push_notification_logs
  FOR ALL USING (true);
