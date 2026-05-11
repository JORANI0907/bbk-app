-- service_applications에 상태점수·추천서비스 컬럼 추가 (관리자 WorkPanel용)
ALTER TABLE service_applications
  ADD COLUMN IF NOT EXISTS condition_score smallint CHECK (condition_score BETWEEN 1 AND 3),
  ADD COLUMN IF NOT EXISTS recommended_services jsonb DEFAULT '[]'::jsonb;

-- condition_score: 1=양호, 2=주의, 3=불량 (정기딥케어·정기엔드케어만 사용)
