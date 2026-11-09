import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import type { CareCheck, CheckStatus } from '@/lib/care-manual-status'
import { flattenManualItems, normalizeCareManual } from '@/types/care-manual'

export const dynamic = 'force-dynamic'

const NO_CACHE = { 'Cache-Control': 'no-store, max-age=0' } as const
const MAX_ROWS = 1000
const MEMO_MAX = 500
const ID_MAX = 64
const ALLOWED_ROLES = ['admin', 'worker']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SELECT = 'id, customer_id, item_id, zone_id, status, memo, photo_url, worker_name, checked_at'

/**
 * 케어매뉴얼 품목 점검 기록 (2026-11-08)
 *   GET  : 이 고객의 최근 기록 (최신순, 최대 1000건) — 관리자·직원
 *   POST : 기록 1건 추가 { item_id, zone_id?, status: 'ok'|'issue', memo?, photo_url? } — 관리자·직원
 * 상태 색은 저장하지 않는다. 화면에서 빈도 × checked_at 으로 계산.
 * 직원은 배정 여부와 상관없이 모든 고객에 기록할 수 있다 (현장 대타·응원 근무가 잦아 의도된 설계).
 * 오류 응답은 고정 문구만 — DB 메시지는 서버 로그로.
 */
function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: NO_CACHE })
}

function authorize(): { userId: string; name: string } | null {
  const session = getServerSession()
  if (!session || !ALLOWED_ROLES.includes(session.role)) return null
  return { userId: session.userId, name: session.name }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!authorize()) return fail('권한 없음', 403)
    const { id } = await params
    if (!UUID_RE.test(id)) return fail('잘못된 고객 id', 400)
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('care_manual_checks')
      .select(SELECT)
      .eq('customer_id', id)
      .order('checked_at', { ascending: false })
      .limit(MAX_ROWS)
    if (error) {
      console.error('[care-manual/checks] 조회 실패:', error.message)
      return fail('점검 기록을 불러오지 못했습니다', 500)
    }
    return NextResponse.json({ checks: (data ?? []) as CareCheck[] }, { headers: NO_CACHE })
  } catch (e) {
    console.error('[care-manual/checks] GET 오류:', e instanceof Error ? e.message : e)
    return fail('점검 기록을 불러오지 못했습니다', 500)
  }
}

interface ParsedBody {
  item_id: string
  zone_id: string | null
  status: CheckStatus
  memo: string | null
  photo_url: string | null
}

const shortId = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 && v.length <= ID_MAX ? v : null)

/** 사진은 우리 Supabase Storage 공개 URL 만 받는다 */
function ownStorageUrl(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  return base && v.startsWith(`${base}/storage/v1/object/public/`) && v.length <= 1024 ? v : null
}

function parseBody(raw: unknown): { ok: true; body: ParsedBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: '요청 본문이 비어 있습니다' }
  const b = raw as Record<string, unknown>
  const item_id = shortId(b.item_id)
  if (!item_id) return { ok: false, error: '품목 id 가 필요합니다' }
  if (b.status !== 'ok' && b.status !== 'issue') return { ok: false, error: '상태는 ok 또는 issue 여야 합니다' }
  const memoRaw = typeof b.memo === 'string' ? b.memo.trim() : ''
  if (memoRaw.length > MEMO_MAX) return { ok: false, error: `메모는 ${MEMO_MAX}자 이내로 적어주세요` }
  if (b.status === 'issue' && !memoRaw) return { ok: false, error: '특이사항은 메모가 필요합니다' }
  if (b.photo_url !== undefined && b.photo_url !== null && b.photo_url !== '' && !ownStorageUrl(b.photo_url)) {
    return { ok: false, error: '사진 주소가 올바르지 않습니다' }
  }
  return {
    ok: true,
    body: { item_id, zone_id: shortId(b.zone_id), status: b.status, memo: memoRaw || null, photo_url: ownStorageUrl(b.photo_url) },
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const who = authorize()
    if (!who) return fail('권한 없음', 403)
    const { id } = await params
    if (!UUID_RE.test(id)) return fail('잘못된 고객 id', 400)
    const parsed = parseBody(await req.json().catch(() => null))
    if (!parsed.ok) return fail(parsed.error, 400)

    const supabase = createServiceClient()
    // 품목이 이 고객 매뉴얼에 실제로 있는지 확인 (없는 고객이면 404)
    const { data: customer, error: custErr } = await supabase.from('customers').select('care_manual').eq('id', id).maybeSingle()
    if (custErr) {
      console.error('[care-manual/checks] 고객 조회 실패:', custErr.message)
      return fail('점검을 저장하지 못했습니다', 500)
    }
    if (!customer) return fail('고객을 찾을 수 없습니다', 404)
    const exists = flattenManualItems(normalizeCareManual(customer.care_manual)).some(f => f.item.id === parsed.body.item_id)
    if (!exists) return fail('이 고객 매뉴얼에 없는 품목입니다', 400)

    const { data, error } = await supabase
      .from('care_manual_checks')
      .insert({ ...parsed.body, customer_id: id, worker_user_id: who.userId, worker_name: who.name ?? null })
      .select(SELECT)
      .single()
    if (error) {
      console.error('[care-manual/checks] 저장 실패:', error.message)
      return fail('점검을 저장하지 못했습니다', 500)
    }
    return NextResponse.json({ check: data as CareCheck }, { headers: NO_CACHE })
  } catch (e) {
    console.error('[care-manual/checks] POST 오류:', e instanceof Error ? e.message : e)
    return fail('점검을 저장하지 못했습니다', 500)
  }
}
