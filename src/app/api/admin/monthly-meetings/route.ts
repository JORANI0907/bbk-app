/**
 * Phase 1 v2 S3: 월간 회의 기록 API
 * PLAN v2 §4.3
 *
 * GET  /api/admin/monthly-meetings?year=YYYY — 리스트 (month DESC)
 * POST /api/admin/monthly-meetings — upsert by month
 *
 * 서버 CHECK: revenue/net_profit 는 페어. 하나만 있으면 400.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { validateUuid } from '@/lib/ops/validators'

const MONTH_RE = /^\d{4}-\d{2}-01$/
const YEAR_RE = /^\d{4}$/

function requireAdmin() {
  const session = getServerSession()
  if (!session) return { ok: false as const, status: 401, error: '인증 필요' }
  if (session.role !== 'admin') return { ok: false as const, status: 403, error: '관리자만' }
  return { ok: true as const, session }
}

function normalizeInt(v: unknown, name: string, min = 0): { ok: true; value: number } | { ok: false; error: string } {
  if (v === undefined || v === null || v === '') return { ok: true, value: 0 }
  const n = Number(v)
  if (!Number.isFinite(n) || n < min) return { ok: false, error: `${name} 오류` }
  return { ok: true, value: Math.round(n) }
}

export async function GET(request: NextRequest) {
  const guard = requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const url = new URL(request.url)
  const year = url.searchParams.get('year') ?? ''
  const supabase = createServiceClient()
  let query = supabase.from('monthly_meetings').select('*').order('month', { ascending: false }).limit(24)

  if (YEAR_RE.test(year)) {
    query = query.gte('month', `${year}-01-01`).lte('month', `${year}-12-01`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, meetings: data ?? [] })
}

export async function POST(request: NextRequest) {
  const guard = requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const body = await request.json().catch(() => ({}))
  const month = String(body.month ?? '')
  if (!MONTH_RE.test(month)) return NextResponse.json({ ok: false, error: 'month 형식 오류 (YYYY-MM-01)' }, { status: 400 })

  // 참석/지표 5개 정규화
  const numericFields = ['attendee_count', 'total_count', 'jobs_count', 'claims_count', 'rework_count', 'churn_count'] as const
  const numericPatch: Record<string, number> = {}
  for (const key of numericFields) {
    const check = normalizeInt(body[key], key)
    if (!check.ok) return NextResponse.json({ ok: false, error: check.error }, { status: 400 })
    numericPatch[key] = check.value
  }

  // renewal_rate (percent 0~100)
  let renewalRate: number | null = null
  if (body.renewal_rate !== undefined && body.renewal_rate !== null && body.renewal_rate !== '') {
    const rr = Number(body.renewal_rate)
    if (!Number.isFinite(rr) || rr < 0 || rr > 100) return NextResponse.json({ ok: false, error: 'renewal_rate 0~100' }, { status: 400 })
    renewalRate = rr
  }

  // revenue / net_profit CHECK (페어)
  const revenueRaw = body.revenue
  const netProfitRaw = body.net_profit
  const hasRevenue = revenueRaw !== undefined && revenueRaw !== null && revenueRaw !== ''
  const hasNet = netProfitRaw !== undefined && netProfitRaw !== null && netProfitRaw !== ''
  if (hasRevenue !== hasNet) {
    return NextResponse.json({ ok: false, error: '매출과 남는 돈은 함께 입력해야 합니다.', code: 'REVENUE_PAIR_REQUIRED' }, { status: 400 })
  }
  let revenue: number | null = null
  let netProfit: number | null = null
  if (hasRevenue && hasNet) {
    revenue = Number(revenueRaw)
    netProfit = Number(netProfitRaw)
    if (!Number.isFinite(revenue) || !Number.isFinite(netProfit)) {
      return NextResponse.json({ ok: false, error: '금액이 숫자가 아닙니다.' }, { status: 400 })
    }
  }

  // 칭찬 사용자
  let praisedUserId: string | null = null
  if (body.praised_user_id) {
    const check = validateUuid(body.praised_user_id, 'praised_user_id')
    if (!check.ok) return NextResponse.json({ ok: false, error: check.error, code: check.code }, { status: 400 })
    praisedUserId = check.value
  }

  // 고칠 것 담당자
  let fixOwnerId: string | null = null
  if (body.fix_owner_id) {
    const check = validateUuid(body.fix_owner_id, 'fix_owner_id')
    if (!check.ok) return NextResponse.json({ ok: false, error: check.error, code: check.code }, { status: 400 })
    fixOwnerId = check.value
  }

  const payload = {
    month,
    held_at: body.held_at ? new Date(body.held_at).toISOString() : null,
    ...numericPatch,
    renewal_rate: renewalRate,
    revenue,
    net_profit: netProfit,
    praised_user_id: praisedUserId,
    praise_reason: typeof body.praise_reason === 'string' ? body.praise_reason : null,
    fix_item: typeof body.fix_item === 'string' ? body.fix_item : null,
    fix_owner_id: fixOwnerId,
    fix_due: body.fix_due || null,
    fix_result: typeof body.fix_result === 'string' ? body.fix_result : 'pending',
    photo_url: typeof body.photo_url === 'string' ? body.photo_url : null,
    decision_1: typeof body.decision_1 === 'string' ? body.decision_1 : null,
    decision_2: typeof body.decision_2 === 'string' ? body.decision_2 : null,
    decision_3: typeof body.decision_3 === 'string' ? body.decision_3 : null,
    updated_at: new Date().toISOString(),
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('monthly_meetings')
    .upsert(payload, { onConflict: 'month' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, meeting: data })
}
