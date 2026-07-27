-- Phase 1: 서비스관리 → 고객관리 통합을 위한 스키마 확장
-- 목적:
--   1. 1회성케어의 신청 단위 결제상태 관리 컬럼 추가
--      (정기딥/정기엔드은 기존 service_billings 테이블 활용)
--   2. 완료 체크박스 클릭 시점 기록 (감사·롤백용)
--   3. 이력탭 조회 성능을 위한 부분 인덱스

-- ─── 1. payment_status 컬럼 (1회성 결제상태) ─────────────────
ALTER TABLE service_applications
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending'
  CHECK (payment_status IN ('pending', 'invoiced', 'paid', 'overdue'));

COMMENT ON COLUMN service_applications.payment_status IS
  '1회성케어 결제상태. 정기딥/정기엔드는 service_billings 테이블 사용';

-- ─── 2. completed_at 컬럼 (완료 체크 시점) ────────────────────
ALTER TABLE service_applications
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

COMMENT ON COLUMN service_applications.completed_at IS
  '완료 체크박스 클릭 시점. 롤백 시 NULL로 초기화. 이력탭 표시 판단은 construction_date 기준(최근 30일)';

-- ─── 3. 조회 성능용 인덱스 ────────────────────────────────────

-- 결제상태별 필터링 (진행 중 목록의 결제상태 필터)
CREATE INDEX IF NOT EXISTS idx_service_applications_payment_status
  ON service_applications(payment_status);

-- 완료 시점별 정렬
CREATE INDEX IF NOT EXISTS idx_service_applications_completed_at
  ON service_applications(completed_at DESC NULLS FIRST);

-- 이력탭 부분 인덱스: 완료된 건만 인덱싱 (construction_date 30일 초과 판별용)
-- 전체 데이터 중 완료건은 소수이므로 부분 인덱스가 압도적으로 효율적
CREATE INDEX IF NOT EXISTS idx_service_applications_history_filter
  ON service_applications(construction_date DESC)
  WHERE work_status = 'completed';
