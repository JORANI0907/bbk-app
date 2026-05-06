-- notices 테이블: target_audience, popup, image_url 컬럼 추가
ALTER TABLE notices
  ADD COLUMN IF NOT EXISTS target_audience TEXT NOT NULL DEFAULT 'all'
    CHECK (target_audience IN ('all', 'admin', 'worker', 'customer')),
  ADD COLUMN IF NOT EXISTS popup BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE INDEX IF NOT EXISTS idx_notices_target_audience ON notices (target_audience);
