-- ============================================================
-- BBK Korea 전체 DB 스키마 (한 번에 실행)
-- 기존 테이블/정책이 있어도 안전하게 재실행 가능
-- ============================================================


-- ============================================================
-- 1. 공통 함수: updated_at 자동 갱신
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 2. users (사용자)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'worker', 'customer')),
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own" ON users;
DROP POLICY IF EXISTS "admin_full_access_users" ON users;

CREATE POLICY "users_read_own" ON users
  FOR SELECT USING (auth_id = auth.uid());

CREATE POLICY "admin_full_access_users" ON users
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role = 'admin')
  );

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 3. customers (고객 업체)
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  business_name TEXT NOT NULL,
  business_number TEXT,
  address TEXT NOT NULL,
  address_detail TEXT,
  latitude DECIMAL,
  longitude DECIMAL,
  contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  door_password TEXT,
  gas_location TEXT,
  power_location TEXT,
  parking_info TEXT,
  special_notes TEXT,
  pipeline_status TEXT DEFAULT 'inquiry'
    CHECK (pipeline_status IN (
      'inquiry', 'quote_sent', 'consulting', 'contracted',
      'schedule_assigned', 'service_scheduled', 'service_done',
      'payment_done', 'subscription_active', 'renewal_pending',
      'churned'
    )),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_read_own" ON customers;
DROP POLICY IF EXISTS "admin_full_access_customers" ON customers;
DROP POLICY IF EXISTS "workers_read_assigned_customers" ON customers;

CREATE POLICY "customers_read_own" ON customers
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "admin_full_access_customers" ON customers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role = 'admin')
  );

DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 4. contracts (계약)
-- ============================================================
CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  contract_type TEXT NOT NULL CHECK (contract_type IN ('onetime', 'subscription')),
  subscription_plan TEXT CHECK (subscription_plan IN ('cycle_3', 'cycle_6', 'cycle_12')),
  visit_frequency TEXT CHECK (visit_frequency IN ('standard', 'double', 'triple')),
  service_grade TEXT DEFAULT 'Z_WHITE' CHECK (service_grade IN ('Z_WHITE', 'G_BLUE', 'D_BLACK')),
  selected_items JSONB NOT NULL DEFAULT '[]',
  monthly_price INTEGER,
  annual_price INTEGER,
  start_date DATE,
  end_date DATE,
  contract_year INTEGER DEFAULT 1,
  discount_rate DECIMAL DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'expired', 'terminated', 'renewed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_read_own_contracts" ON contracts;
DROP POLICY IF EXISTS "admin_full_access_contracts" ON contracts;

CREATE POLICY "customers_read_own_contracts" ON contracts
  FOR SELECT USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );

CREATE POLICY "admin_full_access_contracts" ON contracts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role = 'admin')
  );

DROP TRIGGER IF EXISTS update_contracts_updated_at ON contracts;
CREATE TRIGGER update_contracts_updated_at
  BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 5. service_schedules (서비스 일정)
-- ============================================================
CREATE TABLE IF NOT EXISTS service_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  worker_id UUID REFERENCES users(id) ON DELETE SET NULL,
  scheduled_date DATE NOT NULL,
  scheduled_time_start TIME DEFAULT '22:00',
  scheduled_time_end TIME DEFAULT '06:00',
  items_this_visit JSONB NOT NULL DEFAULT '[]',
  status TEXT DEFAULT 'scheduled' CHECK (status IN (
    'scheduled', 'confirmed', 'in_progress', 'completed',
    'cancelled', 'rescheduled'
  )),
  work_step INTEGER DEFAULT 0 CHECK (work_step BETWEEN 0 AND 5),
  actual_arrival TIMESTAMPTZ,
  actual_completion TIMESTAMPTZ,
  arrival_lat DECIMAL,
  arrival_lng DECIMAL,
  worker_memo TEXT,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN (
    'pending', 'invoiced', 'paid', 'overdue'
  )),
  payment_amount INTEGER,
  payment_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedules_date ON service_schedules(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_schedules_worker ON service_schedules(worker_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_schedules_customer ON service_schedules(customer_id);
CREATE INDEX IF NOT EXISTS idx_schedules_status ON service_schedules(status);

ALTER TABLE service_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_read_own_schedules" ON service_schedules;
DROP POLICY IF EXISTS "workers_own_schedules" ON service_schedules;
DROP POLICY IF EXISTS "workers_update_own_schedules" ON service_schedules;
DROP POLICY IF EXISTS "admin_full_access_schedules" ON service_schedules;

CREATE POLICY "customers_read_own_schedules" ON service_schedules
  FOR SELECT USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );

CREATE POLICY "workers_own_schedules" ON service_schedules
  FOR SELECT USING (
    worker_id IN (SELECT id FROM users WHERE auth_id = auth.uid() AND role = 'worker')
  );

CREATE POLICY "workers_update_own_schedules" ON service_schedules
  FOR UPDATE USING (
    worker_id IN (SELECT id FROM users WHERE auth_id = auth.uid() AND role = 'worker')
  );

CREATE POLICY "admin_full_access_schedules" ON service_schedules
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role = 'admin')
  );

DROP TRIGGER IF EXISTS update_schedules_updated_at ON service_schedules;
CREATE TRIGGER update_schedules_updated_at
  BEFORE UPDATE ON service_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 6. work_checklists (작업 체크리스트)
-- ============================================================
CREATE TABLE IF NOT EXISTS work_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID REFERENCES service_schedules(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  checklist_items JSONB NOT NULL DEFAULT '[]',
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checklists_schedule ON work_checklists(schedule_id);

ALTER TABLE work_checklists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workers_manage_checklists" ON work_checklists;
DROP POLICY IF EXISTS "customers_read_checklists" ON work_checklists;
DROP POLICY IF EXISTS "admin_full_access_checklists" ON work_checklists;

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


-- ============================================================
-- 7. work_photos (작업 사진)
-- ============================================================
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

DROP POLICY IF EXISTS "workers_manage_photos" ON work_photos;
DROP POLICY IF EXISTS "customers_read_own_photos" ON work_photos;
DROP POLICY IF EXISTS "admin_full_access_photos" ON work_photos;

CREATE POLICY "workers_manage_photos" ON work_photos
  FOR ALL USING (
    schedule_id IN (
      SELECT id FROM service_schedules
      WHERE worker_id IN (SELECT id FROM users WHERE auth_id = auth.uid() AND role = 'worker')
    )
  );

CREATE POLICY "customers_read_own_photos" ON work_photos
  FOR SELECT USING (
    schedule_id IN (
      SELECT ss.id FROM service_schedules ss
      JOIN customers c ON ss.customer_id = c.id
      WHERE c.user_id = auth.uid()
    )
  );

CREATE POLICY "admin_full_access_photos" ON work_photos
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role = 'admin')
  );


-- ============================================================
-- 8. closing_checklists (마감 체크리스트 + 고객 평가)
-- ============================================================
CREATE TABLE IF NOT EXISTS closing_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID REFERENCES service_schedules(id) ON DELETE CASCADE UNIQUE,
  garbage_disposal BOOLEAN DEFAULT false,
  gas_valve_check BOOLEAN DEFAULT false,
  electric_check BOOLEAN DEFAULT false,
  security_check BOOLEAN DEFAULT false,
  door_lock_check BOOLEAN DEFAULT false,
  customer_rating INTEGER CHECK (customer_rating BETWEEN 1 AND 5),
  customer_comment TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE closing_checklists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workers_manage_closing" ON closing_checklists;
DROP POLICY IF EXISTS "customers_submit_rating" ON closing_checklists;
DROP POLICY IF EXISTS "customers_read_closing" ON closing_checklists;
DROP POLICY IF EXISTS "admin_full_access_closing" ON closing_checklists;

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


-- ============================================================
-- 9. attendance (출퇴근)
-- ============================================================
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

DROP POLICY IF EXISTS "workers_own_attendance" ON attendance;
DROP POLICY IF EXISTS "admin_full_access_attendance" ON attendance;

CREATE POLICY "workers_own_attendance" ON attendance
  FOR ALL USING (
    worker_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

CREATE POLICY "admin_full_access_attendance" ON attendance
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role = 'admin')
  );


-- ============================================================
-- 10. inventory (재고)
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN ('chemical', 'equipment', 'consumable', 'other')),
  item_name TEXT NOT NULL UNIQUE,
  current_qty DECIMAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL,
  min_qty DECIMAL DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workers_read_inventory" ON inventory;
DROP POLICY IF EXISTS "admin_full_access_inventory" ON inventory;

CREATE POLICY "workers_read_inventory" ON inventory
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role IN ('admin', 'worker'))
  );

CREATE POLICY "admin_full_access_inventory" ON inventory
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role = 'admin')
  );


-- ============================================================
-- 11. inventory_logs (재고 변동 이력)
-- ============================================================
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

DROP POLICY IF EXISTS "workers_log_inventory" ON inventory_logs;
DROP POLICY IF EXISTS "admin_full_access_inv_logs" ON inventory_logs;

CREATE POLICY "workers_log_inventory" ON inventory_logs
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role IN ('admin', 'worker'))
  );

CREATE POLICY "admin_full_access_inv_logs" ON inventory_logs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role = 'admin')
  );


-- ============================================================
-- 12. Realtime 활성화 (이미 추가된 경우 무시)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'service_schedules'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE service_schedules;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'work_checklists'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE work_checklists;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'work_photos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE work_photos;
  END IF;
END $$;


-- ============================================================
-- 13. Storage 버킷 생성
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'work-photos',
  'work-photos',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "authenticated_upload_photos" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_read_photos" ON storage.objects;

CREATE POLICY "authenticated_upload_photos" ON storage.objects
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND bucket_id = 'work-photos'
  );

CREATE POLICY "authenticated_read_photos" ON storage.objects
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND bucket_id = 'work-photos'
  );


-- ============================================================
-- 완료! Table Editor에서 10개 테이블을 확인하세요.
-- ============================================================
