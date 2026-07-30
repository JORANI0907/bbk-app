-- Phase 1 v2 재설계: dead schema 정리
-- 배경: SPEC의 daily_checks/sites/safety_incidents/services_ops 는 BBK 앱 기존 기능과 완전 중복.
--   * daily_checks     → /admin/live + WorkPanel + service_applications.work_started_at/completed_at 로 대체
--   * sites            → customers 재사용 (customer_id 로 정기 고객 지칭)
--   * safety_incidents → /admin/incidents 재사용 (type='safety' 필터 추가 예정)
--   * services_ops     → customers.customer_type + service_applications.service_type 재사용
--
-- 유지: company_intent, functions, standards, metrics_config
--   (SPEC 5층 구조 중 진짜 신설 개념. 기존 앱에 대응 없음)
-- 유지: weekly_notices, monthly_meetings, quarterly_interviews, claims, cash_snapshots, deadlines
--   (기존 notices/reports/incidents/finance 확장으로 매핑하되, Phase 1 v2 확정 후 별도 phase 에서 재검토)

-- ─────────────────────────────────────────────────────────────
-- 1. 트리거 · 함수 정리
-- ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_customers_upsert_recurring_site ON customers;
DROP FUNCTION IF EXISTS customers_upsert_recurring_site() CASCADE;

-- ─────────────────────────────────────────────────────────────
-- 2. sites 관련 auto deadlines 정리 (백필 시 자동 생성된 D-60 2건)
--    sites 테이블 DROP 시 related_site_id fk 자동 제거되지만
--    데이터 자체는 남으므로 명시 삭제
-- ─────────────────────────────────────────────────────────────
DELETE FROM deadlines WHERE source = 'auto' AND related_site_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 3. dead 테이블 삭제 (순서 중요: 참조 관계 역순)
-- ─────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS daily_checks CASCADE;
DROP TABLE IF EXISTS safety_incidents CASCADE;
DROP TABLE IF EXISTS sites CASCADE;
DROP TABLE IF EXISTS services_ops CASCADE;

-- ─────────────────────────────────────────────────────────────
-- 4. dead 헬퍼 함수 정리
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS sites_upsert_contract_deadline() CASCADE;
DROP FUNCTION IF EXISTS daily_checks_prevent_future() CASCADE;

-- current_user_role/current_user_id 는 다른 정책이 재사용 가능하므로 유지.
-- weekly_notices_immutable_after_publish 도 유지 (weekly_notices 테이블은 남음).

-- ─────────────────────────────────────────────────────────────
-- ROLLBACK: 032/033/034 파일을 다시 apply 하면 복원 가능
-- ─────────────────────────────────────────────────────────────
