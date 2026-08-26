/**
 * Batch C-4: 워커용 정기관리 API
 *
 * GET  /api/worker/regular-care?week=YYYY-MM-DD  → 해당 주 내 제출 이력 조회 (본인만)
 * POST /api/worker/regular-care                  → 이번 주 사진 제출 (본인만, 중복 시 upsert)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

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
  const session = getServerSession()
  if (!session) return NextResponse.json({ ok: false, error: '인증 필요' }, { status: 401 })

  const week = request.nextUrl.searchParams.get('week') ?? getWeekStartMonday(getKstToday())
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('equipment_care_records')
    .select('*')
    .eq('worker_id', session.userId)
    .eq('week_start', week)
    .maybeSingle()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, record: data, week_start: week })
}

export async function POST(request: NextRequest) {
  const session = getServerSession()
  if (!session) return NextResponse.json({ ok: false, error: '인증 필요' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const photoUrl = String(body.photo_url ?? '').trim()
  if (!photoUrl) return NextResponse.json({ ok: false, error: 'photo_url 필수' }, { status: 400 })

  const weekStart = getWeekStartMonday(getKstToday())
  const supabase = createServiceClient()

  // 같은 주에 이미 제출 있으면 upsert (사진 교체 허용)
  const { data, error } = await supabase
    .from('equipment_care_records')
    .upsert({
      worker_id: session.userId,
      week_start: weekStart,
      photo_url: photoUrl,
      photo_file_id: typeof body.photo_file_id === 'string' ? body.photo_file_id : null,
      notes: typeof body.notes === 'string' ? body.notes : null,
      submitted_at: new Date().toISOString(),
      // 재제출 시 검토 상태 리셋
      reviewed_by: null,
      reviewed_at: null,
      review_status: null,
      review_notes: null,
    }, { onConflict: 'worker_id,week_start' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, record: data })
}
