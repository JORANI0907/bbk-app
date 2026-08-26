/**
 * Batch B-후속-9: 워커 장비관리보고 API (다중 보고 지원)
 *
 * GET  /api/worker/regular-care                  → 이번주 내 보고 리스트 (최신순)
 * GET  /api/worker/regular-care?history=true     → 최근 12주 내 보고 리스트
 * POST /api/worker/regular-care                  → 매번 새 레코드 INSERT (하루에 여러 번 가능)
 * DELETE /api/worker/regular-care?id=xxx         → 개별 보고 삭제 (본인 소유만)
 *
 * 제약 해제: (worker_id, week_start) UNIQUE 삭제됨 (2026-08-26)
 * 이유: 한 명이 여러 업장 관리 시 하루에도 여러 번 사진 보고 필요
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
  const weekStart = getWeekStartMonday(getKstToday())

  if (isHistory) {
    // 최근 12주 (오늘 기준 12주 전 월요일부터)
    const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') ?? 100), 300)
    const twelveWeeksAgo = new Date()
    twelveWeeksAgo.setUTCDate(twelveWeeksAgo.getUTCDate() - 84)
    const cutoff = twelveWeeksAgo.toISOString().slice(0, 10)
    const { data, error } = await supabase
      .from('equipment_care_records')
      .select('*')
      .eq('worker_id', session.userId)
      .gte('week_start', cutoff)
      .order('submitted_at', { ascending: false })
      .limit(limit)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, history: data ?? [] })
  }

  // 기본: 이번주 내 모든 레코드
  const { data, error } = await supabase
    .from('equipment_care_records')
    .select('*')
    .eq('worker_id', session.userId)
    .eq('week_start', weekStart)
    .order('submitted_at', { ascending: false })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, records: data ?? [], week_start: weekStart })
}

export async function POST(request: NextRequest) {
  const session = getServerSession()
  if (!session) return NextResponse.json({ ok: false, error: '인증 필요' }, { status: 401 })

  const body = await request.json().catch(() => ({}))

  // photo_urls 배열 우선. 하위호환으로 photo_url 단일도 허용.
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

  // B-후속-9: upsert → insert (매번 새 레코드)
  const { data, error } = await supabase
    .from('equipment_care_records')
    .insert({
      worker_id: session.userId,
      week_start: weekStart,
      photo_url: photoUrls[0], // 하위호환
      photo_urls: photoUrls,
      notes: typeof body.notes === 'string' ? body.notes : null,
      submitted_at: new Date().toISOString(),
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, record: data })
}

export async function DELETE(request: NextRequest) {
  const session = getServerSession()
  if (!session) return NextResponse.json({ ok: false, error: '인증 필요' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'id 필수' }, { status: 400 })

  const supabase = createServiceClient()
  // 본인 소유만 삭제 가능
  const { error } = await supabase
    .from('equipment_care_records')
    .delete()
    .eq('id', id)
    .eq('worker_id', session.userId)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
