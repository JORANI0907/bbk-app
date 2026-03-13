-- BBK Korea: 서비스 일정
CREATE TABLE IF NOT EXISTS service_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  worker_id UUID REFERENCES users(id) ON DELETE SET NULL,
  -- 일정
  scheduled_date DATE NOT NULL,
  scheduled_time_start TIME DEFAULT '22:00',
  scheduled_time_end TIME DEFAULT '06:00',
  -- 이번 방문 품목
  items_this_visit JSONB NOT NULL DEFAULT '[]',
  -- 작업 상태
  status TEXT DEFAULT 'scheduled' CHECK (status IN (
    'scheduled', 'confirmed', 'in_progress', 'completed',
    'cancelled', 'rescheduled'
  )),
  work_step INTEGER DEFAULT 0 CHECK (work_step BETWEEN 0 AND 5),
  -- 실제 작업 시간
  actual_arrival TIMESTAMPTZ,
  actual_completion TIMESTAMPTZ,
  arrival_lat DECIMAL,
  arrival_lng DECIMAL,
  -- 메모
  worker_memo TEXT,
  -- 수금
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN (
    'pending', 'invoiced', 'paid', 'overdue'
  )),
  payment_amount INTEGER,
  payment_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_schedules_date ON service_schedules(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_schedules_worker ON service_schedules(worker_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_schedules_customer ON service_schedules(customer_id);
CREATE INDEX IF NOT EXISTS idx_schedules_status ON service_schedules(status);

ALTER TABLE service_schedules ENABLE ROW LEVEL SECURITY;

-- 고객은 자기 계약 일정만
CREATE POLICY "customers_read_own_schedules" ON service_schedules
  FOR SELECT USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );

-- 직원은 자기 배정 일정만
CREATE POLICY "workers_own_schedules" ON service_schedules
  FOR SELECT USING (
    worker_id IN (SELECT id FROM users WHERE auth_id = auth.uid() AND role = 'worker')
  );

-- 직원은 자기 배정 일정 업데이트 (작업 진행)
CREATE POLICY "workers_update_own_schedules" ON service_schedules
  FOR UPDATE USING (
    worker_id IN (SELECT id FROM users WHERE auth_id = auth.uid() AND role = 'worker')
  );

-- 관리자 전체 접근
CREATE POLICY "admin_full_access_schedules" ON service_schedules
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role = 'admin')
  );

CREATE TRIGGER update_schedules_updated_at
  BEFORE UPDATE ON service_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
