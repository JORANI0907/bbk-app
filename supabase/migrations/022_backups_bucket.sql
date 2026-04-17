-- BBK 백업 버킷 생성
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('backups', 'backups', false, 104857600)  -- 100MB
ON CONFLICT (id) DO NOTHING;

-- service_role만 백업 버킷 접근 가능
CREATE POLICY "service_role_only_backups_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'backups' AND auth.role() = 'service_role');

CREATE POLICY "service_role_only_backups_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'backups' AND auth.role() = 'service_role');

CREATE POLICY "service_role_only_backups_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'backups' AND auth.role() = 'service_role');
