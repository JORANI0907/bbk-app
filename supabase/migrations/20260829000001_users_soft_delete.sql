-- users 소프트 삭제 도입 (계정 삭제 시 급여정산·경위서 등 과거 이력 유실 방지)
-- 정책:
--   1. DELETE 대신 deleted_at 세팅 (users row 유지)
--   2. Auth 계정은 즉시 삭제 → 로그인 차단
--   3. is_active 도 함께 false 로 세팅 → 활성 조회에서 자동 제외 (기존 필터 재활용)
--   4. payroll_records / incident_reports 등 person_id → users 매핑이 살아있어 과거 조회 정상

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 활성 사용자 조회 최적화 (부분 인덱스)
CREATE INDEX IF NOT EXISTS users_active_idx
  ON users (role, name)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN users.deleted_at IS
  '소프트 삭제 시각. NULL 이면 활성, 값이 있으면 삭제 처리됨. 과거 이력은 그대로 유지됨.';
