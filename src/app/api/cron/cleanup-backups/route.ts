/**
 * POST /api/cron/cleanup-backups
 * Supabase Storage backups 버킷에서 31일 이상 지난 날짜 폴더 삭제
 * CRON_SECRET 인증 필요
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSlack } from '@/lib/slack'

const CRON_SECRET = process.env.CRON_SECRET
const RETENTION_DAYS = 31

function parseKSTDateFolder(folderName: string): Date | null {
  // 형식: YYYY-MM-DD (ex: 2026-04-18)
  const match = folderName.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const [, y, m, d] = match
  return new Date(`${y}-${m}-${d}T00:00:00+09:00`)
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const now = new Date()

  // 버킷 최상위 목록 조회 (날짜 폴더)
  const { data: folders, error: listError } = await supabase.storage
    .from('backups')
    .list('', { limit: 1000 })

  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 })
  }

  if (!folders || folders.length === 0) {
    return NextResponse.json({ deleted: 0, message: '삭제할 폴더 없음' })
  }

  const deletedFolders: string[] = []
  const errors: string[] = []

  for (const folder of folders) {
    const folderDate = parseKSTDateFolder(folder.name)
    if (!folderDate) continue

    const ageMs = now.getTime() - folderDate.getTime()
    const ageDays = ageMs / (1000 * 60 * 60 * 24)

    if (ageDays >= RETENTION_DAYS) {
      // 폴더 내 파일 목록 조회 후 삭제
      const { data: files, error: fileListError } = await supabase.storage
        .from('backups')
        .list(folder.name, { limit: 100 })

      if (fileListError) {
        errors.push(`${folder.name}: 파일목록 조회 실패`)
        continue
      }

      const filePaths = (files ?? []).map((f) => `${folder.name}/${f.name}`)

      if (filePaths.length > 0) {
        const { error: removeError } = await supabase.storage
          .from('backups')
          .remove(filePaths)

        if (removeError) {
          errors.push(`${folder.name}: 삭제 실패 (${removeError.message})`)
          continue
        }
      }

      deletedFolders.push(folder.name)
    }
  }

  // Slack 알림
  const slackMsg = [
    '🧹 *JSON 백업 정리*',
    `• 삭제: ${deletedFolders.length}개 폴더`,
    deletedFolders.length > 0 ? `• 폴더 목록: ${deletedFolders.join(', ')}` : '',
    errors.length > 0 ? `⚠️ 오류: ${errors.join(' / ')}` : '',
  ].filter(Boolean).join('\n')

  await sendSlack(slackMsg)

  return NextResponse.json({
    success: true,
    deleted: deletedFolders.length,
    deletedFolders,
    errors,
  })
}
