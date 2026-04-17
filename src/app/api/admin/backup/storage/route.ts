/**
 * POST /api/admin/backup/storage
 * Supabase 4개 테이블을 JSON으로 export하여 Storage backups 버킷에 업로드
 * CRON_SECRET 인증 필요
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSlack } from '@/lib/slack'

const CRON_SECRET = process.env.CRON_SECRET

interface UploadResult {
  table: string
  path: string
  rows: number
  sizeBytes: number
  success: boolean
  error?: string
}

function getTodayKST(): string {
  return new Date().toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).replace(/\. /g, '-').replace('.', '').trim()
}

async function exportTable(
  supabase: ReturnType<typeof createServiceClient>,
  tableName: string,
  dateFolder: string,
): Promise<UploadResult> {
  const path = `${dateFolder}/${tableName}.json`

  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .order('created_at', { ascending: true })

  if (error) {
    return { table: tableName, path, rows: 0, sizeBytes: 0, success: false, error: error.message }
  }

  const rows = data ?? []
  const jsonStr = JSON.stringify({ exported_at: new Date().toISOString(), table: tableName, rows }, null, 2)
  const encoder = new TextEncoder()
  const bytes = encoder.encode(jsonStr)

  const { error: uploadError } = await supabase.storage
    .from('backups')
    .upload(path, bytes, {
      contentType: 'application/json',
      upsert: true,
    })

  if (uploadError) {
    return {
      table: tableName,
      path,
      rows: rows.length,
      sizeBytes: bytes.byteLength,
      success: false,
      error: uploadError.message,
    }
  }

  return {
    table: tableName,
    path,
    rows: rows.length,
    sizeBytes: bytes.byteLength,
    success: true,
  }
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const dateFolder = getTodayKST()

  const tables = ['customers', 'service_applications', 'service_schedules', 'workers']
  const results: UploadResult[] = []

  for (const tableName of tables) {
    const result = await exportTable(supabase, tableName, dateFolder)
    results.push(result)
  }

  const totalBytes = results.reduce((sum, r) => sum + r.sizeBytes, 0)
  const totalRows = results.reduce((sum, r) => sum + r.rows, 0)
  const allSuccess = results.every((r) => r.success)

  // Slack 알림
  const kbSize = Math.round(totalBytes / 1024)
  const slackMsg = [
    '💾 *JSON 스냅샷 저장 완료*',
    `• 날짜: ${dateFolder}`,
    `• 파일: ${results.filter((r) => r.success).length}/${tables.length}개`,
    `• 총 레코드: ${totalRows}건`,
    `• 총 용량: ${kbSize}KB`,
    allSuccess ? '' : `⚠️ 오류: ${results.filter((r) => !r.success).map((r) => r.table).join(', ')}`,
  ].filter(Boolean).join('\n')

  await sendSlack(slackMsg)

  return NextResponse.json({
    success: allSuccess,
    date: dateFolder,
    results,
    totalBytes,
    totalRows,
  })
}
