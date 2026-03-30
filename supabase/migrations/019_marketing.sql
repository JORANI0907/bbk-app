-- =====================================================
-- 019_marketing.sql
-- BBK 마케팅 에이전트 관련 테이블
-- =====================================================

-- 1) 매일 콘텐츠 생성 실행 기록
CREATE TABLE IF NOT EXISTS marketing_runs (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_date      DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','running','success','partial','failed')),
  region        TEXT,
  item          TEXT,
  trigger_type  TEXT NOT NULL DEFAULT 'cron'
                CHECK (trigger_type IN ('cron','manual')),
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  duration_sec  INTEGER,
  error_message TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_runs_date ON marketing_runs(run_date DESC);

-- 2) 생성된 콘텐츠
CREATE TABLE IF NOT EXISTS marketing_content (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id        UUID REFERENCES marketing_runs(id) ON DELETE CASCADE,
  content_type  TEXT NOT NULL
                CHECK (content_type IN ('blog','insta','image_prompt')),
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  region        TEXT NOT NULL,
  item          TEXT NOT NULL,
  tags          TEXT[],
  char_count    INTEGER,
  is_published  BOOLEAN DEFAULT FALSE,
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_content_created ON marketing_content(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_content_type ON marketing_content(content_type);
CREATE INDEX IF NOT EXISTS idx_marketing_content_run ON marketing_content(run_id);

-- 3) 키워드 사용 이력 (지역 × 품목)
CREATE TABLE IF NOT EXISTS marketing_keywords (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  region     TEXT NOT NULL,
  item       TEXT NOT NULL,
  is_used    BOOLEAN DEFAULT FALSE,
  used_date  DATE,
  content_id UUID REFERENCES marketing_content(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (region, item)
);

-- 초기 키워드 데이터 (사용완료)
INSERT INTO marketing_keywords (region, item, is_used, used_date) VALUES
  ('용인', '주방청소 전체', true, '2025-10-17'),
  ('용인', '바닥', true, '2025-10-15'),
  ('용인', '후드', true, '2025-10-13'),
  ('성남', '준공청소', true, '2025-10-12'),
  ('성남', '후드', true, '2025-08-22'),
  ('성남', '상가+후드+덕트', true, '2025-08-13'),
  ('강남', '후드', true, '2025-04-22'),
  ('용인', '주방', true, '2025-04-17'),
  ('모란/성남동', '주방', true, '2025-03-11'),
  ('성남', '유리', true, '2025-03-10'),
  ('안양', '식당', true, '2025-03-07'),
  ('강남/논현', '주방', true, '2025-03-05'),
  ('송파/롯데타워', '후드', true, '2025-03-04'),
  ('한남', '주방', true, '2025-03-02'),
  ('수원', '주방', true, '2025-03-01'),
  ('논현동', '주방', true, '2025-02-27'),
  ('강남', '정기청소', true, '2025-02-22'),
  ('서울', '정기청소+마감청소', true, '2025-02-20'),
  ('성남', '바닥+이끼', true, '2025-01-14'),
  ('성남', '에어컨', true, '2025-01-13'),
  ('강남/압구정', '에어컨+공조기', true, '2024-11-21'),
  ('성남/모란', '튀김집', true, '2024-11-28'),
  ('하대원동', '바닥+벽', true, '2024-11-03'),
  ('홍대/마포', '후드', true, '2026-03-28')
ON CONFLICT (region, item) DO NOTHING;

-- 미사용 우선 타겟 초기 데이터
INSERT INTO marketing_keywords (region, item, is_used) VALUES
  ('잠실', '후드', false),
  ('잠실', '주방', false),
  ('잠실', '바닥', false),
  ('판교', '후드', false),
  ('판교', '주방', false),
  ('판교', '에어컨', false),
  ('분당', '후드', false),
  ('분당', '주방', false),
  ('일산', '후드', false),
  ('일산', '주방', false),
  ('신촌', '후드', false),
  ('신촌', '주방', false),
  ('이태원', '후드', false),
  ('이태원', '주방', false),
  ('종로', '후드', false),
  ('영등포', '후드', false),
  ('구로', '주방', false),
  ('관악', '주방', false),
  ('김포', '주방', false),
  ('인천', '후드', false),
  ('부천', '주방', false),
  ('평택', '주방', false),
  ('화성', '주방', false),
  ('이천', '후드', false)
ON CONFLICT (region, item) DO NOTHING;

-- 4) 월별 콘텐츠 통계
CREATE TABLE IF NOT EXISTS marketing_stats (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  month              TEXT NOT NULL UNIQUE,  -- 'YYYY-MM'
  blog_count         INTEGER DEFAULT 0,
  insta_count        INTEGER DEFAULT 0,
  image_prompt_count INTEGER DEFAULT 0,
  blog_target        INTEGER DEFAULT 12,
  insta_target       INTEGER DEFAULT 12,
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- 초기 통계 데이터
INSERT INTO marketing_stats (month, blog_count, insta_count, image_prompt_count)
VALUES ('2026-03', 1, 1, 0)
ON CONFLICT (month) DO NOTHING;

-- 5) 채널별 KPI (수동 입력)
CREATE TABLE IF NOT EXISTS marketing_kpi (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id   UUID REFERENCES marketing_content(id) ON DELETE CASCADE,
  channel      TEXT NOT NULL CHECK (channel IN ('blog','insta','place')),
  metric_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  -- 블로그 지표
  view_count   INTEGER,
  like_count   INTEGER,
  comment_count INTEGER,
  view_tab     BOOLEAN,  -- VIEW탭 노출 여부
  -- 인스타 지표
  reach        INTEGER,
  saves        INTEGER,
  shares       INTEGER,
  -- 플레이스 지표
  place_views  INTEGER,
  phone_clicks INTEGER,
  review_count INTEGER,
  avg_rating   NUMERIC(2,1),
  note         TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 6) 플레이스 리뷰 관리
CREATE TABLE IF NOT EXISTS marketing_place_reviews (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reviewer     TEXT,
  rating       INTEGER CHECK (rating BETWEEN 1 AND 5),
  content      TEXT,
  review_date  DATE,
  is_replied   BOOLEAN DEFAULT FALSE,
  replied_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 활성화
ALTER TABLE marketing_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_kpi ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_place_reviews ENABLE ROW LEVEL SECURITY;

-- 관리자만 접근
CREATE POLICY "admin_all" ON marketing_runs FOR ALL TO authenticated USING (true);
CREATE POLICY "admin_all" ON marketing_content FOR ALL TO authenticated USING (true);
CREATE POLICY "admin_all" ON marketing_keywords FOR ALL TO authenticated USING (true);
CREATE POLICY "admin_all" ON marketing_stats FOR ALL TO authenticated USING (true);
CREATE POLICY "admin_all" ON marketing_kpi FOR ALL TO authenticated USING (true);
CREATE POLICY "admin_all" ON marketing_place_reviews FOR ALL TO authenticated USING (true);
