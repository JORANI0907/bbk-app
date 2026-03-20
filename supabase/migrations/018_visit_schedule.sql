-- 정기케어 고객 방문 주기 설정 컬럼 추가
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS visit_schedule_type TEXT
    CHECK (visit_schedule_type IN ('weekday', 'monthly_date')),
  ADD COLUMN IF NOT EXISTS visit_weekdays INTEGER[]   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS visit_monthly_dates INTEGER[] DEFAULT '{}';

-- customer_requests RLS (고객이 직접 삽입 가능하도록)
ALTER TABLE customer_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "customers_insert_own_requests" ON customer_requests
  FOR INSERT WITH CHECK (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
    AND user_id = auth.uid()
  );

CREATE POLICY IF NOT EXISTS "customers_read_own_requests" ON customer_requests
  FOR SELECT USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );

CREATE POLICY IF NOT EXISTS "admin_full_access_requests" ON customer_requests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role = 'admin')
  );
