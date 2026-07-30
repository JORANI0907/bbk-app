/**
 * Phase 1 v2 S2: 주간 공지 발행
 * PLAN v2 §4.2
 *
 * POST /api/admin/weekly-notices/[id]/publish
 *   published_at = now() 로 세팅. 이미 발행된 경우 409.
 *   발행 시 감사 로그 저장 (Slack 알림은 Phase 27-AN 훅에서 자동)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { validateUuid } from '@/lib/ops/validators'
import { saveNotificationHistory } from '@/lib/notification'

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = getServerSession()
  if (!session) return NextResponse.json({ ok: false, error: '인증 필요' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ ok: false, error: '관리자만' }, { status: 403 })

  const idCheck = validateUuid(params.id, 'id')
  if (!idCheck.ok) return NextResponse.json({ ok: false, error: idCheck.error, code: idCheck.code }, { status: 400 })

  const supabase = createServiceClient()

  const { data: row } = await supabase
    .from('weekly_notices')
    .select('id, week_start, line1, line2, line3, published_at')
    .eq('id', idCheck.value)
    .maybeSingle()

  if (!row) return NextResponse.json({ ok: false, error: '없음' }, { status: 404 })
  if (row.published_at) {
    return NextResponse.json({ ok: false, error: '이미 발행되었습니다.', code: 'ALREADY_PUBLISHED' }, { status: 409 })
  }

  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('weekly_notices')
    .update({ published_at: nowIso })
    .eq('id', idCheck.value)
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  saveNotificationHistory({
    category: 'system',
    type: 'ops_weekly_notice_published',
    body: `주간 공지 발행 — ${row.week_start} · ${row.line1?.slice(0, 30)}…`,
    method: 'manual',
    recipientType: 'admin',
    recipientName: session.name,
    metadata: { notice_id: idCheck.value, week_start: row.week_start, source: 'admin/weekly-notices/publish' },
    status: 'sent',
  }).catch(() => { /* 무시 */ })

  return NextResponse.json({ ok: true, notice: data })
}
