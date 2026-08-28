-- 관리자 사이드바 탭 순서 커스터마이징 (회사 전체 공용 1개 레이아웃)
-- 정책: 관리자만 편집 가능, 저장 결과는 모든 관리자에게 동일하게 적용.
-- 싱글턴 패턴: CHECK (id = 1)로 절대 두 개 row가 생기지 않도록 강제.

CREATE TABLE IF NOT EXISTS admin_nav_layout (
  id          INT PRIMARY KEY DEFAULT 1,
  layout      JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID,
  CHECK (id = 1)
);

COMMENT ON TABLE admin_nav_layout IS
  '관리자 사이드바 탭 순서/그룹 배치 (회사 전체 공용, 싱글턴)';
COMMENT ON COLUMN admin_nav_layout.layout IS
  'NavLayout JSON — { version, items: [{ kind: leaf|group, id, children? }] }';
