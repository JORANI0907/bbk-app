-- BBK Korea: 출퇴근 기록
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID REFERENCES users(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  clock_in TIMESTAMPTZ,
  clock_in_lat DECIMAL,
  clock_in_lng DECIMAL,
  clock_out TIMESTAMPTZ,
  clock_out_lat DECIMAL,
  clock_out_lng DECIMAL,
  UNIQUE(worker_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_worker ON attendance(worker_id, work_date);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(work_date);

ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workers_own_attendance" ON attendance
  FOR ALL USING (
    worker_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

CREATE POLICY "admin_full_access_attendance" ON attendance
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role = 'admin')
  );
