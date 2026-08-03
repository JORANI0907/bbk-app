-- workers.employment_type 한글 자유형 → 스펙 enum 정규화
-- 매핑: 정직원→FULL_TIME, 일용직→DAILY, 인턴→CONTRACT
UPDATE workers
SET employment_type = CASE employment_type
  WHEN '정직원' THEN 'FULL_TIME'
  WHEN '일용직' THEN 'DAILY'
  WHEN '인턴'   THEN 'CONTRACT'
  ELSE employment_type
END
WHERE employment_type IN ('정직원', '일용직', '인턴');
