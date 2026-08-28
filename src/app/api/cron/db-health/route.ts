/**
 * Batch E-4: DB 상태 모니터링 cron
 *
 * POST /api/cron/db-health
 * Authorization: Bearer $CRON_SECRET
 *
 * Make.com 시나리오가 10분마다 호출.
 * 실제 쿼리 응답 시간 + 성공 여부를 측정해서 임계치 초과 시 Slack 알림.
 *
 * 임계치:
 *   - 쿼리 실패              → 즉시 알림 (level: critical)
 *   - 응답 시간 > 3000ms     → 알림 (level: warn)
 *   - 응답 시간 > 5000ms     → 즉시 알림 (level: critical)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSlack } from '@/lib/slack'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET
const WARN_MS = 3000
const CRITICAL_MS = 5000

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!CRON_SECRET || token !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // 실제 자주 쓰이는 쿼리 패턴으로 헬스체크
  // (customers, workers 두 테이블은 대시보드 매 로드마다 히트됨)
  const startedAt = Date.now()
  let errorMessage: string | null = null
  let customersCount = 0
  let workersCount = 0

  try {
    const [cust, work] = await Promise.all([
      supabase.from('customers').select('id', { count: 'exact', head: true }).is('deleted_at', null),
      supabase.from('workers').select('id', { count: 'exact', head: true }),
    ])
    if (cust.error) throw new Error(`customers: ${cust.error.message}`)
    if (work.error) throw new Error(`workers: ${work.error.message}`)
    customersCount = cust.count ?? 0
    workersCount = work.count ?? 0
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : String(e)
  }

  const elapsedMs = Date.now() - startedAt

  // 상태 판정
  let level: 'ok' | 'warn' | 'critical' = 'ok'
  if (errorMessage) level = 'critical'
  else if (elapsedMs > CRITICAL_MS) level = 'critical'
  else if (elapsedMs > WARN_MS) level = 'warn'

  // 경고 이상만 Slack 알림 (정상 상태는 조용히 통과)
  if (level !== 'ok') {
    const emoji = level === 'critical' ? '🚨' : '⚠️'
    const lines = [
      `${emoji} *BBK DB 헬스체크 이상 감지*`,
      `- 상태: ${level.toUpperCase()}`,
      `- 응답시간: ${elapsedMs}ms (경고 ${WARN_MS}ms / 위험 ${CRITICAL_MS}ms)`,
    ]
    if (errorMessage) lines.push(`- 에러: ${errorMessage}`)
    lines.push(`- 시각: ${new Date().toISOString()}`)
    await sendSlack(lines.join('\n'))
  }

  return NextResponse.json({
    ok: level !== 'critical',
    level,
    elapsedMs,
    error: errorMessage,
    customersCount,
    workersCount,
    checkedAt: new Date().toISOString(),
  })
}
