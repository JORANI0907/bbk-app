-- MVP: 관리자·직원 공용 문자 단축어 라이브러리.
-- category 는 자유 텍스트 (CHECK 없음) — UI 에서 새 카테고리 자유 추가.
-- worker_visible: 워커 role 도 조회+복사 가능 여부. 기본 false (관리자 전용).
-- 소프트 삭제(deleted_at) 로 실수 삭제 안전망 확보.

CREATE TABLE IF NOT EXISTS message_snippets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL DEFAULT '기타',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  worker_visible BOOLEAN NOT NULL DEFAULT false,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS message_snippets_category_idx
  ON message_snippets(category) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS message_snippets_worker_visible_idx
  ON message_snippets(worker_visible) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS message_snippets_usage_idx
  ON message_snippets(usage_count DESC, last_used_at DESC) WHERE deleted_at IS NULL;
