-- 계약서 시스템에 직원(worker) 계약 지원 추가.
-- 기존 고객 계약 데이터는 party_type='customer' 로 자동 세팅됨 (무손실).

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS party_type TEXT NOT NULL DEFAULT 'customer'
    CHECK (party_type IN ('customer', 'worker'));

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS worker_id UUID REFERENCES workers(id) ON DELETE CASCADE;

-- customer_id 는 이미 있음. XOR: 한 계약은 customer 또는 worker 중 정확히 하나.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contracts_party_xor'
  ) THEN
    ALTER TABLE contracts ADD CONSTRAINT contracts_party_xor
      CHECK ((customer_id IS NOT NULL) <> (worker_id IS NOT NULL));
  END IF;
END $$;

-- 계약 템플릿도 대상 유형 구분
ALTER TABLE contract_templates
  ADD COLUMN IF NOT EXISTS party_type TEXT NOT NULL DEFAULT 'customer'
    CHECK (party_type IN ('customer', 'worker'));

CREATE INDEX IF NOT EXISTS contracts_worker_id_idx
  ON contracts(worker_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS contracts_party_type_idx
  ON contracts(party_type) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS contract_templates_party_type_idx
  ON contract_templates(party_type) WHERE is_active = true;
