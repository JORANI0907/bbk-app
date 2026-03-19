-- 정기엔드케어 건당 단가 컬럼 추가
-- 이 단가는 담당자와 작업자 각각에게 건당 지급되는 금액
ALTER TABLE service_applications
  ADD COLUMN IF NOT EXISTS unit_price_per_visit INTEGER;

COMMENT ON COLUMN service_applications.unit_price_per_visit
  IS '정기엔드케어 건당 단가 (담당자/작업자 각각 지급)';
