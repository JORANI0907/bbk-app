-- inventory-photos 스토리지 버킷 생성
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inventory-photos',
  'inventory-photos',
  true,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 인증된 사용자 업로드 허용
CREATE POLICY "authenticated_upload_inventory_photos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'inventory-photos');

-- 공개 읽기 허용
CREATE POLICY "public_read_inventory_photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'inventory-photos');
