-- BBK Korea: 작업 체크리스트
CREATE TABLE IF NOT EXISTS work_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID REFERENCES service_schedules(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  checklist_items JSONB NOT NULL DEFAULT '[]',
  -- 예: [{"step": "필터 분리", "done": true, "done_at": "2024-01-01T10:00:00Z"}]
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checklists_schedule ON work_checklists(schedule_id);

ALTER TABLE work_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workers_manage_checklists" ON work_checklists
  FOR ALL USING (
    schedule_id IN (
      SELECT id FROM service_schedules
      WHERE worker_id IN (SELECT id FROM users WHERE auth_id = auth.uid() AND role = 'worker')
    )
  );

CREATE POLICY "customers_read_checklists" ON work_checklists
  FOR SELECT USING (
    schedule_id IN (
      SELECT ss.id FROM service_schedules ss
      JOIN customers c ON ss.customer_id = c.id
      WHERE c.user_id = auth.uid()
    )
  );

CREATE POLICY "admin_full_access_checklists" ON work_checklists
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role = 'admin')
  );
