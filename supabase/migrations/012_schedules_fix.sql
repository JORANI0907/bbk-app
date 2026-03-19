-- service_schedules 보완: application_id 연결 + work_step 제약 수정

-- 1. work_step 제약 수정 (0~5 → 0~6, 6 = 완전완료)
ALTER TABLE service_schedules DROP CONSTRAINT IF EXISTS service_schedules_work_step_check;
ALTER TABLE service_schedules ADD CONSTRAINT service_schedules_work_step_check
  CHECK (work_step BETWEEN 0 AND 6);

-- 2. application_id 컬럼 추가 (신청서와 연결)
ALTER TABLE service_schedules
  ADD COLUMN IF NOT EXISTS application_id UUID REFERENCES service_applications(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_schedules_application ON service_schedules(application_id);
