CREATE TABLE payslip_template (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  employment_type text NOT NULL,
  is_default boolean DEFAULT false,
  default_values jsonb DEFAULT '{}',
  visible_pay_items jsonb DEFAULT '[]',
  visible_deduct_items jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX payslip_template_type_default_idx ON payslip_template(employment_type) WHERE is_default = true;

INSERT INTO payslip_template (name, employment_type, is_default, default_values, visible_pay_items, visible_deduct_items) VALUES
(
  '정규직 (월급제)', 'FULL_TIME', true,
  '{"contracted_monthly_hours": 209, "contracted_weekly_hours": 40}',
  '[
    {"key":"base_salary","label":"기본급","taxable":true,"include_in_ordinary_wage":true},
    {"key":"meal_allowance","label":"식대","taxable":false,"include_in_ordinary_wage":false},
    {"key":"car_allowance","label":"자가운전보조금","taxable":false,"include_in_ordinary_wage":false},
    {"key":"overtime","label":"연장근로수당","taxable":true,"include_in_ordinary_wage":false},
    {"key":"night","label":"야간근로수당","taxable":true,"include_in_ordinary_wage":false},
    {"key":"holiday","label":"휴일근로수당","taxable":true,"include_in_ordinary_wage":false},
    {"key":"annual_leave","label":"연차미사용수당","taxable":true,"include_in_ordinary_wage":false}
  ]',
  '[
    {"key":"national_pension","label":"국민연금"},
    {"key":"health_insurance","label":"건강보험"},
    {"key":"ltc_insurance","label":"장기요양보험"},
    {"key":"employment_insurance","label":"고용보험"},
    {"key":"income_tax","label":"소득세"},
    {"key":"local_income_tax","label":"지방소득세"}
  ]'
),
(
  '계약직/인턴', 'CONTRACT', true,
  '{"contracted_monthly_hours": 209, "contracted_weekly_hours": 40}',
  '[
    {"key":"base_salary","label":"기본급","taxable":true,"include_in_ordinary_wage":true},
    {"key":"meal_allowance","label":"식대","taxable":false,"include_in_ordinary_wage":false},
    {"key":"overtime","label":"연장근로수당","taxable":true,"include_in_ordinary_wage":false},
    {"key":"night","label":"야간근로수당","taxable":true,"include_in_ordinary_wage":false}
  ]',
  '[
    {"key":"national_pension","label":"국민연금"},
    {"key":"health_insurance","label":"건강보험"},
    {"key":"ltc_insurance","label":"장기요양보험"},
    {"key":"employment_insurance","label":"고용보험"},
    {"key":"income_tax","label":"소득세"},
    {"key":"local_income_tax","label":"지방소득세"}
  ]'
),
(
  '아르바이트 (시급제)', 'PART_TIME', true,
  '{"contracted_weekly_hours": 20}',
  '[
    {"key":"base_salary","label":"기본급","taxable":true,"include_in_ordinary_wage":true},
    {"key":"weekly_holiday","label":"주휴수당","taxable":true,"include_in_ordinary_wage":false},
    {"key":"meal_allowance","label":"식대","taxable":false,"include_in_ordinary_wage":false},
    {"key":"overtime","label":"연장근로수당","taxable":true,"include_in_ordinary_wage":false}
  ]',
  '[
    {"key":"national_pension","label":"국민연금"},
    {"key":"health_insurance","label":"건강보험"},
    {"key":"ltc_insurance","label":"장기요양보험"},
    {"key":"employment_insurance","label":"고용보험"},
    {"key":"income_tax","label":"소득세"},
    {"key":"local_income_tax","label":"지방소득세"}
  ]'
),
(
  '초단시간 (주 15시간 미만)', 'ULTRA_SHORT', true,
  '{"contracted_weekly_hours": 14}',
  '[
    {"key":"base_salary","label":"기본급","taxable":true,"include_in_ordinary_wage":true}
  ]',
  '[
    {"key":"income_tax","label":"소득세"},
    {"key":"local_income_tax","label":"지방소득세"}
  ]'
),
(
  '일용직', 'DAILY', true,
  '{"daily_contracted_hours": 8}',
  '[
    {"key":"daily_wage","label":"일당","taxable":true,"include_in_ordinary_wage":true},
    {"key":"weekly_holiday","label":"주휴수당","taxable":true,"include_in_ordinary_wage":false}
  ]',
  '[
    {"key":"daily_income_tax","label":"소득세"},
    {"key":"local_income_tax","label":"지방소득세"},
    {"key":"employment_insurance","label":"고용보험"}
  ]'
),
(
  '프리랜서 (도급)', 'FREELANCER', true,
  '{}',
  '[
    {"key":"service_fee","label":"용역비","taxable":true,"include_in_ordinary_wage":false}
  ]',
  '[
    {"key":"business_income_tax","label":"사업소득세(3%)"},
    {"key":"local_income_tax","label":"지방소득세(0.3%)"}
  ]'
),
(
  '하도급 업체', 'SUBCONTRACT', true,
  '{}',
  '[
    {"key":"contract_amount","label":"계약금액","taxable":false,"include_in_ordinary_wage":false}
  ]',
  '[]'
);
