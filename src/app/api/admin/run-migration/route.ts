// 임시 마이그레이션 실행 엔드포인트 — 021_soft_delete 1회 실행 후 삭제
import { NextRequest, NextResponse } from 'next/server'

const MIGRATION_SECRET = process.env.CRON_SECRET
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Supabase SQL via Management API (pg_net or direct REST)
// Supabase v2 SDK로 DDL 실행: pg 연결 필요
// 대신 Supabase의 /pg/...  또는 fetch to /rest/v1/ with raw query
// 실제로는 Postgres wire protocol 직접 사용 (pg 패키지)
async function execSqlViaPg(sqls: string[]): Promise<{ sql: string; ok: boolean; error?: string }[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Client } = require('pg') as typeof import('pg')

  // Supabase pooler connection (Vercel에서 접근 가능)
  const client = new Client({
    host: 'aws-0-ap-northeast-2.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: `postgres.${SUPABASE_URL.replace('https://', '').replace('.supabase.co', '')}`,
    password: SERVICE_KEY,
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()

  const results: { sql: string; ok: boolean; error?: string }[] = []
  for (const sql of sqls) {
    try {
      await client.query(sql)
      results.push({ sql: sql.slice(0, 80), ok: true })
    } catch (e) {
      results.push({ sql: sql.slice(0, 80), ok: false, error: (e as Error).message })
    }
  }

  await client.end()
  return results
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

  try {
    const results = await execSqlViaPg(stmts)
    return NextResponse.json({ results })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
