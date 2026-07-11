export const MIGRATION_SQL = `-- Run in Supabase SQL Editor
CREATE TABLE IF NOT EXISTS workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  employment_type TEXT CHECK (employment_type IN ('정직원', '인턴', '일용직')),
  phone TEXT,
  account_number TEXT,
  department TEXT CHECK (department IN ('본부', '딥케어', '엔드케어')),
  position TEXT,
  job_title TEXT,
  email TEXT,
  join_date DATE,
  skill_level TEXT CHECK (skill_level IN ('상', '중', '하')),
  specialties TEXT,
  day_wage INTEGER,
  night_wage INTEGER,
  avg_salary INTEGER,
  anniversary TEXT,
  hobby TEXT,
  home_address TEXT,
  emergency_contact TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS work_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
  application_id UUID,
  construction_date DATE,
  business_name TEXT,
  salary INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);`

export interface Worker {
  id: string
  name: string
  employment_type: '정직원' | '인턴' | '일용직' | null
  phone: string | null
  account_number: string | null
  department: '본부' | '딥케어' | '엔드케어' | null
  position: string | null
  job_title: string | null
  email: string | null
  join_date: string | null
  skill_level: '상' | '중' | '하' | null
  specialties: string | null
  day_wage: number | null
  night_wage: number | null
  avg_salary: number | null
  anniversary: string | null
  hobby: string | null
  home_address: string | null
  emergency_contact: string | null
  personal_id: string | null
  photo_url: string | null
  birth_date: string | null
  gender: string | null
  blood_type: string | null
  work_history: string | null
  safety_edu_status: string | null
  safety_edu_date: string | null
  health_cert_status: string | null
  health_cert_date: string | null
  nationality: string | null
  certifications: string | null
  contract_signed: string | null
  bank_copy_submitted: string | null
  tax_type: '4대보험' | '프리랜서3.3%' | '없음' | null
  salary_basis: '세전' | '세후' | null
  created_at: string
  user_id: string | null
}

export interface WorkAssignment {
  id: string
  application_id: string | null
  construction_date: string | null
  business_name: string | null
  salary: number | null
  created_at: string
}
