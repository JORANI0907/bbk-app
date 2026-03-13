-- BBK Korea: 계약
CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  contract_type TEXT NOT NULL CHECK (contract_type IN ('onetime', 'subscription')),
  -- 구독 전용 필드
  subscription_plan TEXT CHECK (subscription_plan IN ('cycle_3', 'cycle_6', 'cycle_12')),
  visit_frequency TEXT CHECK (visit_frequency IN ('standard', 'double', 'triple')),
  service_grade TEXT DEFAULT 'Z_WHITE' CHECK (service_grade IN ('Z_WHITE', 'G_BLUE', 'D_BLACK')),
  -- 품목 (JSONB 배열)
  selected_items JSONB NOT NULL DEFAULT '[]',
  -- 금액
  monthly_price INTEGER,
  annual_price INTEGER,
  -- 기간
  start_date DATE,
  end_date DATE,
  contract_year INTEGER DEFAULT 1,
  discount_rate DECIMAL DEFAULT 0,
  -- 상태
  status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'expired', 'terminated', 'renewed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_read_own_contracts" ON contracts
  FOR SELECT USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );

CREATE POLICY "admin_full_access_contracts" ON contracts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role = 'admin')
  );

CREATE TRIGGER update_contracts_updated_at
  BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
