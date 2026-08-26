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

  const supabase = createServiceClient()
  const isHistory = request.nextUrl.searchParams.get('history') === 'true'

  // B-후속-1: 이력 조회 모드 — 최근 12주 이력 리스트 반환
  if (isHistory) {
    const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') ?? 12), 52)
    const { data, error } = await supabase
      .from('equipment_care_records')
      .select('*')
      .eq('worker_id', session.userId)
      .order('week_start', { ascending: false })
      .limit(limit)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, history: data ?? [] })
  }

  // 기본: 특정 주 조회
  const week = request.nextUrl.searchParams.get('week') ?? getWeekStartMonday(getKstToday())
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

  // B-후속-5: photo_urls 배열 우선 처리 (최대 3장). 하위호환으로 photo_url 단일 값도 지원.
  const rawUrls: unknown = body.photo_urls
  const singleUrl = typeof body.photo_url === 'string' ? body.photo_url.trim() : ''
  let photoUrls: string[] = []
  if (Array.isArray(rawUrls)) {
    photoUrls = rawUrls.map(u => String(u).trim()).filter(Boolean).slice(0, 3)
  } else if (singleUrl) {
    photoUrls = [singleUrl]
  }
  if (photoUrls.length === 0) {
    return NextResponse.json({ ok: false, error: '사진이 최소 1장 필요합니다.' }, { status: 400 })
  }

  const weekStart = getWeekStartMonday(getKstToday())
  const supabase = createServiceClient()

  // 같은 주에 이미 제출 있으면 upsert (사진 교체 허용)
  const { data, error } = await supabase
    .from('equipment_care_records')
    .upsert({
      worker_id: session.userId,
      week_start: weekStart,
      photo_url: photoUrls[0], // 하위호환: 첫 번째 사진
      photo_urls: photoUrls,    // 정본 배열
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
