-- BBK Korea: 전체 스키마 적용 스크립트
-- Supabase 대시보드 > SQL Editor에서 001 ~ 010 순서로 실행

-- 1. users
-- 2. customers
-- 3. contracts
-- 4. service_schedules
-- 5. work_checklists
-- 6. work_photos
-- 7. closing_checklists
-- 8. attendance
-- 9. inventory
-- 10. inventory_logs

-- Storage 버킷 생성 (Supabase Storage > New bucket)
-- name: work-photos
-- public: false
-- allowed MIME types: image/jpeg, image/png, image/webp
-- max file size: 10MB

-- Storage RLS 정책
INSERT INTO storage.buckets (id, name, public)
VALUES ('work-photos', 'work-photos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload photos"
ON storage.objects FOR INSERT
WITH CHECK (
  auth.role() = 'authenticated'
  AND bucket_id = 'work-photos'
);

CREATE POLICY "Users can view relevant photos"
ON storage.objects FOR SELECT
USING (
  auth.role() = 'authenticated'
  AND bucket_id = 'work-photos'
);
