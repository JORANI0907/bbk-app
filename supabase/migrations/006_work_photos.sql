-- BBK Korea: 작업 사진
CREATE TABLE IF NOT EXISTS work_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID REFERENCES service_schedules(id) ON DELETE CASCADE,
  checklist_id UUID REFERENCES work_checklists(id) ON DELETE SET NULL,
  photo_type TEXT NOT NULL CHECK (photo_type IN ('before', 'after', 'during', 'damage', 'closing')),
  storage_path TEXT NOT NULL,
  photo_url TEXT NOT NULL,
  taken_at TIMESTAMPTZ DEFAULT now(),
  gps_lat DECIMAL,
  gps_lng DECIMAL,
  uploaded_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_photos_schedule ON work_photos(schedule_id);
CREATE INDEX IF NOT EXISTS idx_photos_type ON work_photos(schedule_id, photo_type);

ALTER TABLE work_photos ENABLE ROW LEVEL SECURITY;

-- 직원 업로드/조회
CREATE POLICY "workers_manage_photos" ON work_photos
  FOR ALL USING (
    schedule_id IN (
      SELECT id FROM service_schedules
      WHERE worker_id IN (SELECT id FROM users WHERE auth_id = auth.uid() AND role = 'worker')
    )
  );

-- 고객은 자기 현장 사진만 읽기
CREATE POLICY "customers_read_own_photos" ON work_photos
  FOR SELECT USING (
    schedule_id IN (
      SELECT ss.id FROM service_schedules ss
      JOIN customers c ON ss.customer_id = c.id
      WHERE c.user_id = auth.uid()
    )
  );

-- 관리자 전체 접근
CREATE POLICY "admin_full_access_photos" ON work_photos
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role = 'admin')
  );
