-- BBK Korea: 고객 업체 정보
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
  -- 현장 정보 (직원이 볼 정보)
  door_password TEXT,
  gas_location TEXT,
  power_location TEXT,
  parking_info TEXT,
  special_notes TEXT,
  -- 파이프라인 상태
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

-- 고객은 자기 데이터만 본다
CREATE POLICY "customers_read_own" ON customers
  FOR SELECT USING (user_id = auth.uid());

-- 관리자 전체 접근
CREATE POLICY "admin_full_access_customers" ON customers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role = 'admin')
  );

-- 직원은 자기 배정 현장 정보 읽기
CREATE POLICY "workers_read_assigned_customers" ON customers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM service_schedules ss
      JOIN users u ON ss.worker_id = u.id
      WHERE ss.customer_id = customers.id
        AND u.auth_id = auth.uid()
        AND u.role = 'worker'
    )
  );

CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
