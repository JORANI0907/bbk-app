CREATE TABLE payslip_issue_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  payslip_id uuid NOT NULL REFERENCES payroll_payslips(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('EMAIL', 'SMS', 'KAKAO', 'PRINT', 'PORTAL')),
  recipient text,
  sent_at timestamptz DEFAULT now(),
  result text NOT NULL DEFAULT 'success' CHECK (result IN ('success', 'failed')),
  error_message text
);

CREATE INDEX payslip_issue_log_payslip_id_idx ON payslip_issue_log(payslip_id);
CREATE INDEX payslip_issue_log_sent_at_idx ON payslip_issue_log(sent_at DESC);
