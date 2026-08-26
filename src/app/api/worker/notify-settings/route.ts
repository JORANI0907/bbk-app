/**
 * Batch C-2/C-3: 워커 self 알림 요일 설정 API
 *
 * GET   /api/worker/notify-settings
 *   → 본인 workers 레코드의 알림 요일 배열 2종 반환
 * PATCH /api/worker/notify-settings
 *   body: { attendance_notify_weekdays?: number[], equipment_notify_weekdays?: number[] }
 *   → 본인 workers 업데이트. 요일 값 0~6 검증. 배열 최대 7 (equipment 는 2)
 *
 * 워커 세션 필요. session.userId (users.id) 로 workers.user_id 매칭.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

function requireWorker() {
  const session = getServerSession()
  if (!session) return { ok: false as const, status: 401, error: '인증 필요' }
  // admin 도 조회/변경 가능 (본인이 워커면 자신의 설정)
  return { ok: true as const, session }
}

function normalizeWeekdays(input: unknown, maxLen: number): number[] | null {
  if (!Array.isArray(input)) return null
  const filtered = Array.from(new Set(input
    .map(v => Number(v))
    .filter(n => Number.isInteger(n) && n >= 0 && n <= 6)
  )).slice(0, maxLen).sort((a, b) => a - b)
  return filtered
}

export async function GET() {
  const guard = requireWorker()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('workers')
    .select('id, attendance_notify_weekdays, equipment_notify_weekdays')
    .eq('user_id', guard.session.userId)
    .maybeSingle()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ ok: true, attendance_notify_weekdays: [], equipment_notify_weekdays: [] })

  return NextResponse.json({
    ok: true,
    worker_id: data.id,
    attendance_notify_weekdays: data.attendance_notify_weekdays ?? [],
    equipment_notify_weekdays: data.equipment_notify_weekdays ?? [],
  })
}

export async function PATCH(request: NextRequest) {
  const guard = requireWorker()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const body = await request.json().catch(() => ({}))
  const updates: Record<string, number[]> = {}

  if ('attendance_notify_weekdays' in body) {
    const arr = normalizeWeekdays(body.attendance_notify_weekdays, 7)
    if (arr === null) return NextResponse.json({ ok: false, error: 'attendance_notify_weekdays 형식 오류' }, { status: 400 })
    updates.attendance_notify_weekdays = arr
  }
  if ('equipment_notify_weekdays' in body) {
    const arr = normalizeWeekdays(body.equipment_notify_weekdays, 2)
    if (arr === null) return NextResponse.json({ ok: false, error: 'equipment_notify_weekdays 형식 오류' }, { status: 400 })
    updates.equipment_notify_weekdays = arr
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: '업데이트할 필드가 없습니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('workers')
    .update(updates)
    .eq('user_id', guard.session.userId)
    .select('id, attendance_notify_weekdays, equipment_notify_weekdays')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, ...data })
}
