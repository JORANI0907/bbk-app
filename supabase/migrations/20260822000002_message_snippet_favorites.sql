-- Phase 2: 사용자별 즐겨찾기.
-- 관리자·직원 모두 자기가 자주 쓰는 문구를 별표할 수 있음.
-- snippet 삭제 시 CASCADE — 소프트 삭제 상황에서도 유령 즐겨찾기 방지.

CREATE TABLE IF NOT EXISTS message_snippet_favorites (
  user_id UUID NOT NULL,
  snippet_id UUID NOT NULL REFERENCES message_snippets(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, snippet_id)
);

CREATE INDEX IF NOT EXISTS message_snippet_favorites_user_idx
  ON message_snippet_favorites(user_id);
