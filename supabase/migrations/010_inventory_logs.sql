-- BBK Korea: 재고 변동 이력
CREATE TABLE IF NOT EXISTS inventory_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID REFERENCES inventory(id) ON DELETE CASCADE,
  worker_id UUID REFERENCES users(id) ON DELETE SET NULL,
  schedule_id UUID REFERENCES service_schedules(id) ON DELETE SET NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('use', 'receive', 'return', 'adjust')),
  quantity DECIMAL NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_logs_inventory ON inventory_logs(inventory_id);
CREATE INDEX IF NOT EXISTS idx_inv_logs_date ON inventory_logs(created_at);

ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workers_log_inventory" ON inventory_logs
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role IN ('admin', 'worker'))
  );

CREATE POLICY "admin_full_access_inv_logs" ON inventory_logs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role = 'admin')
  );

-- Supabase Realtime 활성화 (관리자 모니터링용)
ALTER PUBLICATION supabase_realtime ADD TABLE service_schedules;
ALTER PUBLICATION supabase_realtime ADD TABLE work_checklists;
ALTER PUBLICATION supabase_realtime ADD TABLE work_photos;
