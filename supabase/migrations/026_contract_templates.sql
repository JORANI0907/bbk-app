-- contract_templates 테이블 생성
CREATE TABLE IF NOT EXISTS contract_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  html_body TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- contracts 테이블에 template_id 컬럼 추가
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES contract_templates(id) ON DELETE SET NULL;
