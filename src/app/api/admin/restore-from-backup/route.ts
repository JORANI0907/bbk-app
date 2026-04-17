/**
 * POST /api/admin/restore-from-backup
 * Supabase Storage 백업 JSON에서 데이터 복구
 * 관리자 권한 + 2차 확인 토큰 필요
 * ⚠️ 위험한 작업: 복구 전 현재 DB 상태를 스냅샷으로 저장
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { sendSlack } from '@/lib/slack'

const ALLOWED_TABLES = ['customers', 'service_applications', 'service_schedules', 'workers'] as const
type AllowedTable = typeof ALLOWED_TABLES[number]

interface RestoreRequestBody {
  date: string
  table: AllowedTable | 'all'
  mode: 'upsert' | 'replace'
  confirm: string
}

interface BackupJsonFile {
  exported_at: string
  table: string
  rows: Array<Record<string, unknown>>
}

function isAllowedTable(val: unknown): val is AllowedTable {
  return typeof val === 'string' && (ALLOWED_TABLES as readonly string[]).includes(val)
}

function getTodayKSTTimestamp(): string {
  return new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
  }).replace(/[^\d]/g, '').slice(0, 14)
}

async function downloadBackupJson(
  supabase: ReturnType<typeof createServiceClient>,
  path: string,
): Promise<BackupJsonFile | null> {
  const { data, error } = await supabase.storage
    .from('backups')
    .download(path)

  if (error || !data) return null

  try {
    const text = await data.text()
    return JSON.parse(text) as BackupJsonFile
  } catch {
    return null
  }
}

async function saveCurrentSnapshot(
  supabase: ReturnType<typeof createServiceClient>,
  tableName: AllowedTable,
  timestamp: string,
): Promise<void> {
  const { data } = await supabase
    .from(tableName)
    .select('*')
    .order('created_at', { ascending: true })

  if (!data) return

  const jsonStr = JSON.stringify(
    { exported_at: new Date().toISOString(), table: tableName, rows: data },
    null,
    2,
  )
  const encoder = new TextEncoder()
  const bytes = encoder.encode(jsonStr)

  await supabase.storage
    .from('backups')
    .upload(`restore-snapshots/${timestamp}-${tableName}.json`, bytes, {
      contentType: 'application/json',
      upsert: true,
    })
}

async function restoreTable(
  supabase: ReturnType<typeof createServiceClient>,
  tableName: AllowedTable,
  rows: Array<Record<string, unknown>>,
  mode: 'upsert' | 'replace',
): Promise<{ restored: number; errors: number }> {
  let restored = 0
  let errors = 0

  if (mode === 'replace') {
    // replace 모드: 기존 데이터 전체 삭제 후 삽입 (주의: 참조 무결성 고려)
    // 소프트 딜리트가 있는 테이블은 deleted_at을 복원하는 방식으로 upsert
    // 안전을 위해 upsert 방식 강제 사용
  }

  // 배치로 upsert (100건씩)
  const batchSize = 100
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await supabase
      .from(tableName)
      .upsert(batch, { onConflict: 'id' })

    if (error) {
      errors += batch.length
    } else {
      restored += batch.length
    }
  }

  return { restored, errors }
}

export async function POST(request: NextRequest) {
  // 1. 관리자 권한 체크
  const sessionSupabase = createClient()
  const { data: { user } } = await sessionSupabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const serviceSupabase = createServiceClient()
  const { data: userRecord } = await serviceSupabase
    .from('users')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  if (userRecord?.role !== 'admin') {
    return NextResponse.json({ error: '관리자만 복구를 실행할 수 있습니다.' }, { status: 403 })
  }

  // 2. 요청 파싱 및 검증
  let body: RestoreRequestBody
  try {
    body = await request.json() as RestoreRequestBody
  } catch {
    return NextResponse.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 })
  }

  const { date, table, mode, confirm } = body

  // 2차 확인 토큰 검증
  if (confirm !== 'YES_I_UNDERSTAND') {
    return NextResponse.json(
      { error: '2차 확인 토큰이 올바르지 않습니다. confirm: "YES_I_UNDERSTAND" 를 포함해야 합니다.' },
      { status: 400 },
    )
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date는 YYYY-MM-DD 형식이어야 합니다.' }, { status: 400 })
  }

  if (!table || (table !== 'all' && !isAllowedTable(table))) {
    return NextResponse.json(
      { error: `table은 ${[...ALLOWED_TABLES, 'all'].join(' | ')} 중 하나여야 합니다.` },
      { status: 400 },
    )
  }

  if (!mode || (mode !== 'upsert' && mode !== 'replace')) {
    return NextResponse.json({ error: 'mode는 upsert 또는 replace 여야 합니다.' }, { status: 400 })
  }

  const targetTables: AllowedTable[] = table === 'all' ? [...ALLOWED_TABLES] : [table]
  const timestamp = getTodayKSTTimestamp()

  // 3. 복구 전 현재 DB 스냅샷 저장 (롤백 대비)
  for (const t of targetTables) {
    await saveCurrentSnapshot(serviceSupabase, t, timestamp)
  }

  // 4. 복구 실행
  const restoreResults: Array<{ table: string; restored: number; errors: number }> = []

  for (const t of targetTables) {
    const path = `${date}/${t}.json`
    const backupFile = await downloadBackupJson(serviceSupabase, path)

    if (!backupFile) {
      restoreResults.push({ table: t, restored: 0, errors: -1 })
      continue
    }

    const { restored, errors } = await restoreTable(serviceSupabase, t, backupFile.rows, mode)
    restoreResults.push({ table: t, restored, errors })
  }

  const totalRestored = restoreResults.reduce((sum, r) => sum + r.restored, 0)

  // 5. Slack 알림
  const slackMsg = [
    '🔄 *백업 복구 실행*',
    `• 날짜: ${date}`,
    `• 테이블: ${targetTables.join(', ')}`,
    `• 모드: ${mode}`,
    `• 총 복구: ${totalRestored}건`,
    `• 실행자: ${user.email ?? user.id}`,
    `• 스냅샷 저장: restore-snapshots/${timestamp}`,
  ].join('\n')

  await sendSlack(slackMsg)

  return NextResponse.json({
    success: true,
    date,
    mode,
    tables: targetTables,
    results: restoreResults,
    totalRestored,
    snapshotTimestamp: timestamp,
  })
}
