-- =========================================================
-- 알림 시스템 마이그레이션
-- 생성일: 2026-05-11
-- 목적: Slack 알림을 앱 내부 알림 이력으로 대체
-- =========================================================

-- 1. 모든 알림 이력 테이블 (Slack 대체)
CREATE TABLE IF NOT EXISTS notification_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category        TEXT NOT NULL CHECK (category IN ('alimtalk','sms','missed_call','payment','system','push')),
  type            TEXT NOT NULL,
  method          TEXT DEFAULT 'auto' CHECK (method IN ('auto','manual')),
  recipient_type  TEXT CHECK (recipient_type IN ('admin','worker','customer')),
  recipient_id    UUID,
  recipient_name  TEXT,
  recipient_phone TEXT,
  title           TEXT,
  body            TEXT NOT NULL,
  metadata        JSONB DEFAULT '{}',
  status          TEXT DEFAULT 'sent' CHECK (status IN ('sent','failed')),
  error_message   TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_history_recipient ON notification_history(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_history_category ON notification_history(category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_history_created ON notification_history(created_at DESC);

ALTER TABLE notification_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON notification_history FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. 자동 알림 규칙 테이블
CREATE TABLE IF NOT EXISTS notification_rules (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type                  TEXT NOT NULL UNIQUE,
  label                 TEXT NOT NULL,
  description           TEXT,
  channel_alimtalk      BOOLEAN DEFAULT true,
  channel_sms           BOOLEAN DEFAULT false,
  channel_push          BOOLEAN DEFAULT true,
  channel_in_app        BOOLEAN DEFAULT true,
  notify_admin          BOOLEAN DEFAULT true,
  notify_customer       BOOLEAN DEFAULT false,
  notify_worker         BOOLEAN DEFAULT false,
  alimtalk_template_id  TEXT,
  is_active             BOOLEAN DEFAULT true,
  sort_order            INTEGER DEFAULT 0,
  updated_at            TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE notification_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON notification_rules FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read" ON notification_rules FOR SELECT TO authenticated USING (true);

-- 초기 규칙 데이터 삽입 (기존 ALIMTALK_TEMPLATES 13가지 기반)
INSERT INTO notification_rules (type, label, description, channel_alimtalk, channel_sms, channel_push, channel_in_app, notify_admin, notify_customer, notify_worker, alimtalk_template_id, sort_order) VALUES
('예약확정알림',     '예약 확정',         '서비스 신청 후 예약이 확정될 때 고객에게 발송',       true,  false, true, true, true, true,  false, NULL, 1),
('결제완료알림',     '결제 완료',         '결제 완료 시 고객에게 발송',                          true,  true,  true, true, true, true,  false, NULL, 2),
('계약완료알림',     '계약 완료',         '온라인 계약서 서명 완료 시 발송',                     true,  false, true, true, true, true,  false, NULL, 3),
('서비스시작알림',   '서비스 시작',       '작업자 현장 도착 후 서비스 시작 시 발송',             true,  false, true, true, true, true,  false, NULL, 4),
('작업완료알림',     '작업 완료',         '작업 완료 시 고객에게 발송',                          true,  true,  true, true, true, true,  false, NULL, 5),
('일정변경알림',     '일정 변경',         '서비스 일정이 변경될 때 고객에게 발송',               true,  false, true, true, true, true,  false, NULL, 6),
('서비스취소알림',   '서비스 취소',       '서비스가 취소될 때 고객에게 발송',                    true,  false, true, true, true, true,  false, NULL, 7),
('작업자배정알림',   '작업자 배정',       '작업자 배정 완료 시 고객에게 발송',                   true,  false, true, true, true, true,  false, NULL, 8),
('작업자일정안내',   '작업자 일정 안내',  '작업자에게 배정 일정 안내',                           false, true,  true, true, true, false, true,  NULL, 9),
('구독권유알림',     '구독 권유',         '1회성 케어 이용 후 정기 구독 안내',                   false, true,  false,true, false,true,  false, NULL, 10),
('부재중전화알림',   '부재중 전화',       '고객 부재중 전화 수신 시 관리자에게 알림',            false, false, true, true, true, false, false, NULL, 11),
('카드결제알림',     '카드 결제',         '카드 결제 완료 시 관리자에게 알림',                   false, false, true, true, true, false, false, NULL, 12),
('견적안내알림',     '견적 안내',         '견적 안내 발송',                                      true,  false, true, true, true, true,  false, NULL, 13)
ON CONFLICT (type) DO NOTHING;
