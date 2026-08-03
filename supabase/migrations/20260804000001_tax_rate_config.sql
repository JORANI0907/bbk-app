CREATE TABLE tax_rate_config (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL,
  value numeric NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  memo text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX tax_rate_config_key_date_idx ON tax_rate_config(key, effective_from);

INSERT INTO tax_rate_config (key, value, effective_from, effective_to, memo) VALUES
('national_pension_employee',     0.0475,   '2026-01-01', NULL,         '국민연금 근로자분 (2026 인상: 9.5%/2)'),
('national_pension_employer',     0.0475,   '2026-01-01', NULL,         '국민연금 사업주분'),
('national_pension_cap',          6370000,  '2026-01-01', '2026-06-30', '국민연금 기준소득월액 상한'),
('national_pension_floor',        400000,   '2026-01-01', '2026-06-30', '국민연금 기준소득월액 하한'),
('health_insurance_employee',     0.03595,  '2026-01-01', NULL,         '건강보험 근로자분 (7.19%/2)'),
('health_insurance_employer',     0.03595,  '2026-01-01', NULL,         '건강보험 사업주분'),
('ltc_insurance_total',           0.009448, '2026-01-01', NULL,         '장기요양보험 노사합산 (소득 대비)'),
('employment_insurance_employee', 0.009,    '2026-01-01', NULL,         '고용보험 근로자분 (실업급여)'),
('employment_insurance_employer', 0.009,    '2026-01-01', NULL,         '고용보험 사업주분 (실업급여)'),
('employment_stability',          0.0025,   '2026-01-01', NULL,         '고용안정직능개발 사업주분 (150인 미만)'),
('wage_claim_guarantee',          0.0009,   '2026-01-01', NULL,         '임금채권보장기금 사업주분'),
('severance_accrual',             0.0833,   '2026-01-01', NULL,         '퇴직급여 적립률 (1/12)'),
('local_income_tax',              0.1,      '2026-01-01', NULL,         '지방소득세율 (소득세의 10%)'),
('standard_monthly_hours',        209,      '2026-01-01', NULL,         '월 소정근로시간 (주40h 기준)'),
('minimum_hourly_wage',           10320,    '2026-01-01', NULL,         '2026년 최저시급'),
('meal_allowance_limit',          200000,   '2026-01-01', NULL,         '식대 비과세 월 한도'),
('car_allowance_limit',           200000,   '2026-01-01', NULL,         '자가운전보조금 월 한도'),
('daily_worker_deduction',        150000,   '2026-01-01', NULL,         '일용직 1일 근로소득공제'),
('daily_worker_tax_rate',         0.027,    '2026-01-01', NULL,         '일용직 소득세율 ((일당-15만)×2.7%)'),
('business_income_tax',           0.03,     '2026-01-01', NULL,         '프리랜서 사업소득세율'),
('avg_weeks_per_month',           4.345,    '2026-01-01', NULL,         '월 평균 주수 (365/7/12)');
