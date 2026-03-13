-- service_applications 테이블 생성
CREATE TABLE IF NOT EXISTS service_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_at TEXT,

  -- 신청자 정보
  owner_name TEXT NOT NULL,
  platform_nickname TEXT,
  phone TEXT NOT NULL,
  email TEXT,

  -- 사업장 정보
  business_name TEXT NOT NULL,
  business_number TEXT,
  address TEXT NOT NULL,
  business_hours_start TEXT,
  business_hours_end TEXT,

  -- 접근/주차
  elevator TEXT,
  building_access TEXT,
  access_method TEXT,
  parking TEXT,

  -- 결제
  payment_method TEXT,
  account_number TEXT,

  -- 동의
  privacy_consent TEXT,
  service_consent TEXT,
  request_notes TEXT,

  -- 관리용
  status TEXT NOT NULL DEFAULT '신규',
  admin_notes TEXT,
  notion_page_id TEXT
);

-- RLS 활성화
ALTER TABLE service_applications ENABLE ROW LEVEL SECURITY;

-- 관리자만 접근 가능
DROP POLICY IF EXISTS "admin_all_service_applications" ON service_applications;
CREATE POLICY "admin_all_service_applications" ON service_applications
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role = 'admin')
  );

-- Realtime 활성화
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'service_applications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE service_applications;
  END IF;
END $$;
