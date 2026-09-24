-- customers 테이블에 요일별 담당자·작업자 매핑 컬럼 추가.
--
-- 목적: 정기엔드/정기딥케어에서 요일마다 담당자·작업자가 다른 케이스를
-- 자동화하기 위한 스냅샷 소스. 회차 생성 시 각 날짜의 요일 → 이 매핑에서
-- 담당자/작업자를 자동 배정한다.
--
-- 구조: JSONB 객체 (키 = 요일 번호 '0'~'6', 값 = { user_id, worker_ids }).
--   { "1": { "user_id": "<uuid>", "worker_ids": ["<uuid>",...] },
--     "3": { "user_id": "<uuid>", "worker_ids": ["<uuid>"] } }
-- 요일 번호는 JS Date.getDay() 규칙(0=일 ~ 6=토).
-- 비어있는 요일 or 빈 객체({}) 이면 기존 assigned_user_id 로 fallback (하위호환).
--
-- 롤백: 컬럼 미사용 상태에서는 안전하게 DROP 가능.
--   ALTER TABLE customers DROP COLUMN weekday_assignments;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS weekday_assignments jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN customers.weekday_assignments IS
  '요일별 담당자·작업자 매핑 {요일번호(0=일~6=토): {user_id, worker_ids}}. 회차 생성·재배정 시 참조. 비어있으면 assigned_user_id fallback.';
