-- BBK Korea: 마감 체크리스트 + 고객 평가
CREATE TABLE IF NOT EXISTS closing_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID REFERENCES service_schedules(id) ON DELETE CASCADE UNIQUE,
  -- 마감 항목
  garbage_disposal BOOLEAN DEFAULT false,
  gas_valve_check BOOLEAN DEFAULT false,
  electric_check BOOLEAN DEFAULT false,
  security_check BOOLEAN DEFAULT false,
  door_lock_check BOOLEAN DEFAULT false,
  -- 고객 평가
  customer_rating INTEGER CHECK (customer_rating BETWEEN 1 AND 5),
  customer_comment TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE closing_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workers_manage_closing" ON closing_checklists
  FOR ALL USING (
    schedule_id IN (
      SELECT id FROM service_schedules
      WHERE worker_id IN (SELECT id FROM users WHERE auth_id = auth.uid() AND role = 'worker')
    )
  );

CREATE POLICY "customers_submit_rating" ON closing_checklists
  FOR UPDATE USING (
    schedule_id IN (
      SELECT ss.id FROM service_schedules ss
      JOIN customers c ON ss.customer_id = c.id
      WHERE c.user_id = auth.uid()
    )
  );

CREATE POLICY "customers_read_closing" ON closing_checklists
  FOR SELECT USING (
    schedule_id IN (
      SELECT ss.id FROM service_schedules ss
      JOIN customers c ON ss.customer_id = c.id
      WHERE c.user_id = auth.uid()
    )
  );

CREATE POLICY "admin_full_access_closing" ON closing_checklists
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role = 'admin')
  );
