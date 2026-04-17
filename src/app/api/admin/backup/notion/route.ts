/**
 * POST /api/admin/backup/notion
 * Supabase 4개 테이블을 Notion DB에 upsert 백업
 * CRON_SECRET 인증 필요
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSlack } from '@/lib/slack'
import {
  upsertNotionPage,
  customerToNotionProps,
  applicationToNotionProps,
  scheduleToNotionProps,
  workerToNotionProps,
  notionTitle,
  notionText,
  notionNumber,
  notionDate,
  sleep,
  type CustomerRow,
  type ApplicationRow,
  type ScheduleRow,
  type WorkerRow,
} from '@/lib/notion-backup'

const CRON_SECRET = process.env.CRON_SECRET

interface BackupTableResult {
  table: string
  total: number
  created: number
  updated: number
  errors: number
  durationMs: number
}

async function backupTable<T extends Record<string, unknown>>(
  supabase: ReturnType<typeof createServiceClient>,
  tableName: string,
  databaseId: string,
  propsFn: (row: T) => Record<string, unknown>,
): Promise<BackupTableResult> {
  const startTime = Date.now()

  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .order('created_at', { ascending: true })

  if (error) {
    return {
      table: tableName,
      total: 0,
      created: 0,
      updated: 0,
      errors: 1,
      durationMs: Date.now() - startTime,
    }
  }

  const rows = (data ?? []) as T[]
  let created = 0
  let updated = 0
  let errors = 0

  for (const row of rows) {
    const recordId = String(row.id ?? '')
    if (!recordId) {
      errors++
      continue
    }
    const props = propsFn(row)
    const result = await upsertNotionPage(databaseId, recordId, props)
    if (result === 'created') created++
    else if (result === 'updated') updated++
    else errors++
  }

  return {
    table: tableName,
    total: rows.length,
    created,
    updated,
    errors,
    durationMs: Date.now() - startTime,
  }
}

async function writeBackupLog(
  supabase: ReturnType<typeof createServiceClient>,
  logDbId: string,
  results: BackupTableResult[],
  totalDurationMs: number,
): Promise<void> {
  const kst = new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })

  const summary = results
    .map((r) => `${r.table}: ${r.total}건 (생성 ${r.created} / 업데이트 ${r.updated} / 오류 ${r.errors})`)
    .join('\n')

  const properties: Record<string, unknown> = {
    id: notionTitle(`backup-${Date.now()}`),
    실행시각: notionText(kst),
    소요시간: notionNumber(Math.round(totalDurationMs / 1000)),
    상태: {
      select: {
        name: results.every((r) => r.errors === 0) ? '성공' : '부분오류',
      },
    },
    결과요약: notionText(summary),
    customers_건수: notionNumber(results.find((r) => r.table === 'customers')?.total ?? 0),
    service_applications_건수: notionNumber(results.find((r) => r.table === 'service_applications')?.total ?? 0),
    service_schedules_건수: notionNumber(results.find((r) => r.table === 'service_schedules')?.total ?? 0),
    workers_건수: notionNumber(results.find((r) => r.table === 'workers')?.total ?? 0),
  }

  const notionApiKey = process.env.NOTION_API_KEY
  if (!notionApiKey) return

  await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${notionApiKey}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({
      parent: { database_id: logDbId },
      properties,
    }),
  }).catch(() => {})

  // supabase 파라미터는 향후 DB 로그 테이블 사용 시를 위해 유지
  void supabase
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const notionApiKey = process.env.NOTION_API_KEY
  if (!notionApiKey) {
    return NextResponse.json(
      { error: 'NOTION_API_KEY가 설정되지 않았습니다. Notion integration 토큰을 발급하고 환경변수에 등록해주세요.' },
      { status: 503 },
    )
  }

  const customersDbId = process.env.NOTION_BACKUP_CUSTOMERS_DB_ID
  const applicationsDbId = process.env.NOTION_BACKUP_APPLICATIONS_DB_ID
  const schedulesDbId = process.env.NOTION_BACKUP_SCHEDULES_DB_ID
  const workersDbId = process.env.NOTION_BACKUP_WORKERS_DB_ID
  const logDbId = process.env.NOTION_BACKUP_LOG_DB_ID

  if (!customersDbId || !applicationsDbId || !schedulesDbId || !workersDbId || !logDbId) {
    return NextResponse.json(
      { error: 'Notion DB ID 환경변수가 설정되지 않았습니다.' },
      { status: 503 },
    )
  }

  const supabase = createServiceClient()
  const totalStart = Date.now()

  const results: BackupTableResult[] = []

  // 순차 실행 (Notion rate limit 준수)
  const customersResult = await backupTable<CustomerRow>(
    supabase, 'customers', customersDbId, customerToNotionProps,
  )
  results.push(customersResult)

  await sleep(500)

  const applicationsResult = await backupTable<ApplicationRow>(
    supabase, 'service_applications', applicationsDbId, applicationToNotionProps,
  )
  results.push(applicationsResult)

  await sleep(500)

  const schedulesResult = await backupTable<ScheduleRow>(
    supabase, 'service_schedules', schedulesDbId, scheduleToNotionProps,
  )
  results.push(schedulesResult)

  await sleep(500)

  const workersResult = await backupTable<WorkerRow>(
    supabase, 'workers', workersDbId, workerToNotionProps,
  )
  results.push(workersResult)

  const totalDurationMs = Date.now() - totalStart

  // 백업 로그 기록
  await writeBackupLog(supabase, logDbId, results, totalDurationMs)

  // Slack 알림
  const slackMsg = [
    '📦 *Notion 백업 완료*',
    `• 고객: ${customersResult.total}건`,
    `• 서비스신청: ${applicationsResult.total}건`,
    `• 일정: ${schedulesResult.total}건`,
    `• 작업자: ${workersResult.total}건`,
    `• 소요시간: ${Math.round(totalDurationMs / 1000)}초`,
  ].join('\n')
  await sendSlack(slackMsg)

  return NextResponse.json({
    success: true,
    results,
    totalDurationMs,
  })
}
