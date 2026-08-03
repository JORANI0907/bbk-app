ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS contracted_monthly_hours integer,
  ADD COLUMN IF NOT EXISTS contracted_weekly_hours integer,
  ADD COLUMN IF NOT EXISTS dependents integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS enrolled_national_pension boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS enrolled_health_insurance boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS enrolled_employment_insurance boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES payslip_template(id);

COMMENT ON COLUMN workers.contracted_monthly_hours IS '월 소정근로시간 (월급제 기본 209h)';
COMMENT ON COLUMN workers.contracted_weekly_hours IS '주 소정근로시간 (시급제 주휴 판정용)';
COMMENT ON COLUMN workers.dependents IS '부양가족수 (간이세액표 조회용, 기본 1)';
COMMENT ON COLUMN workers.enrolled_national_pension IS '국민연금 가입 여부';
COMMENT ON COLUMN workers.enrolled_health_insurance IS '건강보험 가입 여부';
COMMENT ON COLUMN workers.enrolled_employment_insurance IS '고용보험 가입 여부';
COMMENT ON COLUMN workers.template_id IS '적용 명세서 템플릿 (payslip_template.id)';
