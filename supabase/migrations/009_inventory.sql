-- BBK Korea: 재고
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

CREATE POLICY "workers_read_inventory" ON inventory
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role IN ('admin', 'worker'))
  );

CREATE POLICY "admin_full_access_inventory" ON inventory
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role = 'admin')
  );
