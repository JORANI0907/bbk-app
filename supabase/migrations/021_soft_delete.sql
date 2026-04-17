-- 소프트 삭제 컬럼 추가
ALTER TABLE customers              ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE service_applications   ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE service_schedules      ADD COLUMN deleted_at TIMESTAMPTZ;

-- 활성 레코드 인덱스 (deleted_at IS NULL)
CREATE INDEX idx_customers_active         ON customers(id)            WHERE deleted_at IS NULL;
CREATE INDEX idx_applications_active      ON service_applications(id) WHERE deleted_at IS NULL;
CREATE INDEX idx_schedules_active         ON service_schedules(id)    WHERE deleted_at IS NULL;

-- 삭제된 레코드 인덱스 (휴지통 조회 + 60일 자동 영구삭제용)
CREATE INDEX idx_customers_deleted_at     ON customers(deleted_at)    WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_applications_deleted_at  ON service_applications(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_schedules_deleted_at     ON service_schedules(deleted_at) WHERE deleted_at IS NOT NULL;
