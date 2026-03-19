-- 공지사항 / 행사 테이블
CREATE TABLE IF NOT EXISTS notices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'notice'  CHECK (type IN ('notice', 'event')),
  priority    TEXT NOT NULL DEFAULT 'normal'  CHECK (priority IN ('normal', 'important', 'urgent')),
  pinned      BOOLEAN NOT NULL DEFAULT false,
  event_date  DATE,
  author_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notices_created_at ON notices (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notices_pinned     ON notices (pinned DESC, created_at DESC);
