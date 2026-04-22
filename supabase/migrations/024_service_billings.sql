-- BBK Korea: 청구/결제 이력 관리
-- 방문 일정(service_schedules)과 독립적으로 청구 주기를 관리
-- 대상: 정기딥케어(연간) / 정기엔드케어(월간)

CREATE TABLE IF NOT EXISTS service_billings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  -- monthly: 정기엔드케어 월간 청구 / annual: 정기딥케어 연간 청구
  billing_type TEXT NOT NULL CHECK (billing_type IN ('monthly', 'annual')),
  -- 청구 기간 표시 (월간: '2026-04', 연간: '2026')
  billing_period TEXT NOT NULL,
  amount INTEGER NOT NULL,
  due_date DATE NOT NULL,
  paid_date DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billings_customer ON service_billings(customer_id);
CREATE INDEX IF NOT EXISTS idx_billings_due_date ON service_billings(due_date);
CREATE INDEX IF NOT EXISTS idx_billings_status ON service_billings(status);

ALTER TABLE service_billings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_billings" ON service_billings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role = 'admin')
  );

CREATE TRIGGER update_billings_updated_at
  BEFORE UPDATE ON service_billings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
