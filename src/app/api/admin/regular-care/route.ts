/**
 * Batch C-4: 관리자용 정기관리 API
 *
 * GET  /api/admin/regular-care?week=YYYY-MM-DD
 *   → 해당 주 전 작업자 진행 현황 (제출 완료 + 미제출자 함께 반환)
 *
 * PATCH /api/admin/regular-care
 *   body: { id, review_status: 'approved' | 'need_recheck', review_notes? }
 *   → 관리자 검토 상태 업데이트
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

function requireAdmin() {
  const session = getServerSession()
  if (!session) return { ok: false as const, status: 401, error: '인증 필요' }
  if (session.role !== 'admin') return { ok: false as const, status: 403, error: '관리자만' }
  return { ok: true as const, session }
}

function getWeekStartMonday(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  const dow = d.getUTCDay()
  const diff = dow === 0 ? -6 : 1 - dow
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

function getKstToday(): string {
  const kst = new Date(Date.now() + 9 * 3600 * 1000)
  return kst.toISOString().slice(0, 10)
}

export async function GET(request: NextRequest) {
  const guard = requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const week = request.nextUrl.searchParams.get('week') ?? getWeekStartMonday(getKstToday())
  const supabase = createServiceClient()

  // 활성 작업자 전체 조회
  const { data: workers } = await supabase
    .from('users')
    .select('id, name, phone')
    .eq('role', 'worker')
    .eq('is_active', true)
    .order('name', { ascending: true })

  // 해당 주 제출된 기록 조회
  const { data: records } = await supabase
    .from('equipment_care_records')
    .select('*')
    .eq('week_start', week)

  const recordByWorker = new Map<string, typeof records extends (infer R)[] | null ? R : never>()
  for (const r of records ?? []) {
    recordByWorker.set(r.worker_id as string, r)
  }

  // 워커별 통합 리스트 (제출 완료 + 미제출자)
  const list = (workers ?? []).map(w => {
    const rec = recordByWorker.get(w.id) ?? null
    return {
      worker_id: w.id,
      worker_name: w.name,
      worker_phone: w.phone,
      submitted: !!rec,
      record: rec,
    }
  })

  const submittedCount = list.filter(x => x.submitted).length
  const totalCount = list.length
  const pct = totalCount > 0 ? Math.round((submittedCount / totalCount) * 100) : null

  return NextResponse.json({
    ok: true,
    week_start: week,
    total_workers: totalCount,
    submitted_count: submittedCount,
    pct,
    list,
  })
}

export async function PATCH(request: NextRequest) {
  const guard = requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const body = await request.json().catch(() => ({}))
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'id 필수' }, { status: 400 })

  const status = body.review_status
  if (status !== 'approved' && status !== 'need_recheck') {
    return NextResponse.json({ ok: false, error: 'review_status는 approved 또는 need_recheck' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('equipment_care_records')
    .update({
      review_status: status,
      review_notes: typeof body.review_notes === 'string' ? body.review_notes : null,
      reviewed_by: guard.session.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, record: data })
}
