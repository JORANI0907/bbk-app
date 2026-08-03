ALTER TABLE payroll_payslips
  ADD COLUMN IF NOT EXISTS snapshot_rates jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_input jsonb,
  ADD COLUMN IF NOT EXISTS pay_items jsonb,
  ADD COLUMN IF NOT EXISTS deduct_items jsonb,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS employment_type text,
  ADD COLUMN IF NOT EXISTS calc_method_strings jsonb;

-- 기존 발행 완료 명세서는 CONFIRMED 처리
UPDATE payroll_payslips SET status = 'CONFIRMED' WHERE status = 'DRAFT';
