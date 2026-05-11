-- ============================================================================
-- 030: 마감 체크리스트에 전반 상태 점수 및 추천 서비스 컬럼 추가
-- ============================================================================
-- 작업자가 마감 시 입력하는 두 항목:
--   condition_score: 전반적 상태 (1=양호, 2=주의, 3=불량)
--   recommended_services: 추가 추천 서비스 목록
--     형식: [{ "name": string, "reason": string, "priority": "high"|"medium"|"low" }]
--
-- 고객 포털 /customer/reports 페이지에서 활용:
--   - 회차별 양호/주의/불량 표시
--   - 가장 최근 보고 기준의 권장 서비스 노출
-- ============================================================================

ALTER TABLE closing_checklists
  ADD COLUMN IF NOT EXISTS condition_score smallint
    CHECK (condition_score BETWEEN 1 AND 3),
  ADD COLUMN IF NOT EXISTS recommended_services jsonb
    NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN closing_checklists.condition_score IS
  '전반 상태: 1=양호(green), 2=주의(yellow), 3=불량(red)';
COMMENT ON COLUMN closing_checklists.recommended_services IS
  '추천 추가 서비스 목록 [{name, reason, priority}]';

-- 고객 리포트 페이지 성능을 위한 인덱스 (schedule_id 단위로 1:1)
-- 기존 unique index가 schedule_id에 존재하면 스킵됨
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'closing_checklists'
      AND indexname = 'closing_checklists_schedule_id_idx'
  ) THEN
    CREATE INDEX closing_checklists_schedule_id_idx
      ON closing_checklists (schedule_id);
  END IF;
END $$;
