-- customers 테이블에 방문일자별 담당자·작업자 매핑 컬럼 추가 (정기딥/정기엔드 월간 모드용).
--
-- 배경: 20260924000001 로 요일별 매핑(weekday_assignments) 이 도입되어 주간 방문 계약의
-- 요일별 회차 자동 배정은 커버됐다. 하지만 월간 방문(예: 매월 5·15·25일) 은 요일이 아니라
-- 특정 "일자" 기준이라 별도 컬럼이 필요하다.
--
-- 구조: JSONB 객체 (키 = 방문 일자 '1'~'31', 값 = { user_id, worker_ids }).
--   { "5":  { "user_id": "<uuid>", "worker_ids": ["<uuid>",...] },
--     "15": { "user_id": "<uuid>", "worker_ids": ["<uuid>"] } }
-- 회차 생성 시 방문일자 → 이 매핑에서 담당자·작업자 자동 배정.
-- 비어있는 일자 or 빈 객체({}) 이면 assigned_user_id fallback.
--
-- 정책: visit_cycle_unit 별 분기.
--   - week: weekday_assignments (요일 키 0~6)
--   - month: monthly_date_assignments (일자 키 1~31)
--   - day/others: 상단 assigned_user_id / customerWorkerIds fallback
--
-- 롤백: 컬럼 미사용 상태에서는 안전하게 DROP 가능.
--   ALTER TABLE customers DROP COLUMN monthly_date_assignments;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS monthly_date_assignments jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN customers.monthly_date_assignments IS
  '방문일자별 담당자·작업자 매핑 {일자(1~31): {user_id, worker_ids}}. visit_cycle_unit=month 회차 생성·재배정 시 참조. 비어있으면 assigned_user_id fallback.';
