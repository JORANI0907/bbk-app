-- workers 테이블에 관리자 메모 리스트 컬럼 추가.
--
-- 목적: 각 직원별 특이사항·이슈·인계 사항 등을 여러 개 기록하고 각 메모마다 작성 시각 표시.
-- 구조: jsonb 배열. 각 항목 { text: string, created_at: ISO8601 string }.
-- 초기값: 빈 배열([]) — NULL 대신 빈 배열로 두면 프론트에서 length 체크만으로 처리 가능.

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS memo_list jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN workers.memo_list IS
  '관리자 메모 리스트 [{text, created_at}]. WorkerDetail 화면에서 추가·삭제·조회.';
