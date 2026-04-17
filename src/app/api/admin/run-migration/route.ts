// 임시 마이그레이션 실행 엔드포인트 — 021_soft_delete 1회 실행 후 삭제
import { NextRequest, NextResponse } from 'next/server'

const MIGRATION_SECRET = process.env.CRON_SECRET
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function execSql(sql: string): Promise<{ ok: boolean; error?: string }> {
  // Supabase REST API를 통해 직접 SQL 실행 (service_role key 필요)
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql }),
  })
  if (res.ok) return { ok: true }
  const body = await res.text()
  return { ok: false, error: body }
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!MIGRATION_SECRET || auth !== MIGRATION_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const stmts = [
    `ALTER TABLE customers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
    `ALTER TABLE service_applications ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
    `ALTER TABLE service_schedules ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
    `CREATE INDEX IF NOT EXISTS idx_customers_active ON customers(id) WHERE deleted_at IS NULL`,
    `CREATE INDEX IF NOT EXISTS idx_applications_active ON service_applications(id) WHERE deleted_at IS NULL`,
    `CREATE INDEX IF NOT EXISTS idx_schedules_active ON service_schedules(id) WHERE deleted_at IS NULL`,
    `CREATE INDEX IF NOT EXISTS idx_customers_deleted_at ON customers(deleted_at) WHERE deleted_at IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_applications_deleted_at ON service_applications(deleted_at) WHERE deleted_at IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_schedules_deleted_at ON service_schedules(deleted_at) WHERE deleted_at IS NOT NULL`,
  ]

  const results = []
  for (const sql of stmts) {
    const result = await execSql(sql)
    results.push({ sql: sql.slice(0, 80), ...result })
  }

  return NextResponse.json({ results })
}
