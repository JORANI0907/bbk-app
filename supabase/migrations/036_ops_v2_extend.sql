-- Phase 1 v2: 기존 스키마 확장 (얇게 얹기 원칙)
-- PLAN v2 §2.3
--
-- 1) service_applications 에 관리자 반응 컬럼 2개
--    /admin/live 카드에 [반응] 버튼 → SPEC 규정 제6조 3항 "대표 무반응 = 위반" 커버
-- 2) claims.site_id → claims.customer_id 로 재정의
--    v1 에서 신설된 claims.site_id 는 sites 테이블 DROP (035) 로 fk orphan.
--    v2 재설계: SPEC 클레임은 "고객 클레임" 이므로 customer 참조가 자연스러움.
--    데이터 0건이라 안전 재정의.

-- ─────────────────────────────────────────────────────────────
-- 1. service_applications: admin 반응 컬럼
-- ─────────────────────────────────────────────────────────────
ALTER TABLE service_applications
  ADD COLUMN IF NOT EXISTS admin_reacted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_reacted_at timestamptz;

COMMENT ON COLUMN service_applications.admin_reacted_by IS
  'SPEC 규정 제6조 3항: 관리자가 완료 카드에 반응한 사용자. null 상태 24h 초과 시 Slack 알림.';

-- 부분 인덱스: 완료됐지만 관리자 미반응인 것 스캔 최적화 (24h cron 용)
CREATE INDEX IF NOT EXISTS idx_service_applications_no_admin_reaction
  ON service_applications (work_completed_at)
  WHERE work_completed_at IS NOT NULL AND admin_reacted_by IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 2. claims: site_id → customer_id 재정의
--    데이터 0건이라 컬럼 교체 안전.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE claims DROP COLUMN IF EXISTS site_id;
ALTER TABLE claims
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE RESTRICT;

-- customer_id NOT NULL 강제 (데이터 없으니 안전)
ALTER TABLE claims ALTER COLUMN customer_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_claims_customer_id ON claims (customer_id);

-- 기존 site_id 관련 인덱스는 sites DROP 시 자동 정리됨.

-- ─────────────────────────────────────────────────────────────
-- ROLLBACK
-- ─────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS idx_service_applications_no_admin_reaction;
-- ALTER TABLE service_applications DROP COLUMN IF EXISTS admin_reacted_by, DROP COLUMN IF EXISTS admin_reacted_at;
-- DROP INDEX IF EXISTS idx_claims_customer_id;
-- ALTER TABLE claims DROP COLUMN IF EXISTS customer_id;
