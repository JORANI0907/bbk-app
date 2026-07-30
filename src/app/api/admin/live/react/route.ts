/**
 * Phase 1 v2 S1: 오늘의 현장 (완료 카드) 관리자 반응
 * PLAN v2 §4.1
 *
 * POST /api/admin/live/react
 *   body: { application_id }
 *   admin 만 · service_applications.admin_reacted_by/at 세팅
 *   이미 반응됨 시 409 ALREADY_REACTED
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { saveNotificationHistory } from '@/lib/notification'
import { validateUuid } from '@/lib/ops/validators'

export async function POST(request: NextRequest) {
  const session = getServerSession()
  if (!session) return NextResponse.json({ ok: false, error: '인증 필요' }, { status: 401 })
  if (session.role !== 'admin') {
    return NextResponse.json({ ok: false, error: '관리자만 반응할 수 있습니다.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const idCheck = validateUuid(body.application_id, 'application_id')
  if (!idCheck.ok) return NextResponse.json({ ok: false, error: idCheck.error, code: idCheck.code }, { status: 400 })

  const supabase = createServiceClient()

  // 대상 존재 + 완료됨 + 미반응 확인
  const { data: app } = await supabase
    .from('service_applications')
    .select('id, business_name, owner_name, work_completed_at, admin_reacted_by')
    .eq('id', idCheck.value)
    .maybeSingle()

  if (!app) return NextResponse.json({ ok: false, error: '신청서를 찾을 수 없습니다.' }, { status: 404 })
  if (!app.work_completed_at) {
    return NextResponse.json({ ok: false, error: '완료되지 않은 작업입니다.', code: 'NOT_COMPLETED' }, { status: 400 })
  }
  if (app.admin_reacted_by) {
    return NextResponse.json({ ok: false, error: '이미 반응된 항목입니다.', code: 'ALREADY_REACTED' }, { status: 409 })
  }

  const nowIso = new Date().toISOString()
  const { error } = await supabase
    .from('service_applications')
    .update({ admin_reacted_by: session.userId, admin_reacted_at: nowIso })
    .eq('id', idCheck.value)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // 감사 로그 (Phase 27-AN Slack 통합 훅에 자동 표기)
  saveNotificationHistory({
    category: 'system',
    type: 'ops_live_reacted',
    body: `오늘의 현장 반응 — ${app.business_name ?? ''} · ${app.owner_name ?? ''} · ${session.name}`,
    method: 'manual',
    recipientType: 'admin',
    recipientName: session.name,
    metadata: { application_id: idCheck.value, source: 'admin/live/react' },
    status: 'sent',
  }).catch(() => { /* 무시 */ })

  return NextResponse.json({
    ok: true,
    application_id: idCheck.value,
    reacted_by: session.userId,
    reacted_by_name: session.name,
    reacted_at: nowIso,
  })
}
