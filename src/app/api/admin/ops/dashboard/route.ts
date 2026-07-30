/**
 * Phase 1 v2 S5: /admin 홈 대시보드 통합 API
 * PLAN v2 §4.5
 *
 * GET /api/admin/ops/dashboard
 *   admin 만 · 4블록 통합 응답
 *   {
 *     ok: true,
 *     intent: { purpose, intent_1/2/3, tradeoffs, nevers, always, safe_days_start_date, year },
 *     heartbeat: {
 *       daily_check_rate: { completed, reacted, pct },       // SPEC 규정 제6조 3항
 *       weekly_notice: { has_this_week, week_start },        // SPEC 4.3 3줄 공지
 *       next_meeting_dday: { held_this_month, dday },        // SPEC 4.4 월간회의
 *       safe_days: { count, start_date },                    // safe_days_start_date 기반
 *     },
 *     monthly_numbers: {
 *       jobs_count, claims_count, rework_count, churn_count, renewal_rate,
 *     },
 *     deadlines: [ top 5 pending ],
 *   }
 *
 * 지표 계산 규칙: PLAN v2 §5
 * 계산 실패해도 200 반환 (빈 값 채워서). 관측용 로그만 남김.
 */

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

interface IntentBlock {
  purpose: string
  intent_1: string; intent_2: string; intent_3: string
  intent_1_tradeoff: string | null
  intent_2_tradeoff: string | null
  intent_3_tradeoff: string | null
  never_1: string | null; never_2: string | null; never_3: string | null
  always_1: string | null; always_2: string | null; always_3: string | null
  year: number
  safe_days_start_date: string
}

function getKstToday(): string {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 3600 * 1000)
  return kst.toISOString().slice(0, 10)
}

function getMonthStart(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`
}

function getWeekStartMonday(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  const dow = d.getUTCDay() // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  const t1 = new Date(`${a}T00:00:00Z`).getTime()
  const t2 = new Date(`${b}T00:00:00Z`).getTime()
  return Math.floor((t2 - t1) / (24 * 3600 * 1000))
}

export async function GET() {
  const session = getServerSession()
  if (!session) return NextResponse.json({ ok: false, error: '인증 필요' }, { status: 401 })
  if (session.role !== 'admin') {
    return NextResponse.json({ ok: false, error: '관리자만 접근 가능' }, { status: 403 })
  }

  const supabase = createServiceClient()
  const today = getKstToday()
  const monthStart = getMonthStart(today)
  const weekStart = getWeekStartMonday(today)

  // ─── 1. Intent (company_intent id=1) ──────────────────────
  const { data: intentRow } = await supabase
    .from('company_intent')
    .select('*')
    .eq('id', 1)
    .maybeSingle()

  const intent: IntentBlock = intentRow ?? {
    purpose: '', intent_1: '', intent_2: '', intent_3: '',
    intent_1_tradeoff: null, intent_2_tradeoff: null, intent_3_tradeoff: null,
    never_1: null, never_2: null, never_3: null,
    always_1: null, always_2: null, always_3: null,
    year: new Date().getFullYear(),
    safe_days_start_date: today,
  }

  // ─── 2. Heartbeat 4타일 ────────────────────────────────────
  // 2-1. 일일확인률: 오늘 완료된 카드 중 반응된 비율
  const { data: todayCompleted } = await supabase
    .from('service_applications')
    .select('id, admin_reacted_by')
    .eq('construction_date', today)
    .not('work_completed_at', 'is', null)

  const completedCount = todayCompleted?.length ?? 0
  const reactedCount = (todayCompleted ?? []).filter(a => a.admin_reacted_by).length
  const dailyCheckPct = completedCount > 0 ? Math.round((reactedCount / completedCount) * 100) : null

  // 2-2. 이번주 공지: weekly_notices에 이번주 발행분?
  const { data: thisWeekNotice } = await supabase
    .from('weekly_notices')
    .select('id, published_at')
    .eq('week_start', weekStart)
    .not('published_at', 'is', null)
    .maybeSingle()

  // 2-3. 다음 회의 D-day: 이달 monthly_meetings 있으면 held_at, 없으면 이달 마지막 금요일까지 D-day (간소화: 이달 말)
  const { data: thisMonthMeeting } = await supabase
    .from('monthly_meetings')
    .select('id, month, held_at')
    .eq('month', monthStart)
    .maybeSingle()

  // 간단 D-day: 이달 마지막 날까지
  const nextMonthFirst = new Date(`${monthStart}T00:00:00Z`)
  nextMonthFirst.setUTCMonth(nextMonthFirst.getUTCMonth() + 1)
  const monthEnd = new Date(nextMonthFirst.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10)
  const meetingDday = thisMonthMeeting?.held_at ? null : daysBetween(today, monthEnd)

  // 2-4. 연속 무사고일수: safe_days_start_date 로부터 오늘까지
  const safeDays = daysBetween(intent.safe_days_start_date, today)

  // ─── 3. 이달의 숫자 5타일 ──────────────────────────────────
  // 이달 완료 건수
  const { count: jobsCount } = await supabase
    .from('service_applications')
    .select('id', { count: 'exact', head: true })
    .gte('construction_date', monthStart)
    .lte('construction_date', today)
    .not('work_completed_at', 'is', null)

  // 이달 클레임 건수
  const { data: monthClaims } = await supabase
    .from('claims')
    .select('id, is_rework')
    .gte('occurred_at', `${monthStart}T00:00:00Z`)

  const claimsCount = monthClaims?.length ?? 0
  const reworkCount = (monthClaims ?? []).filter(c => c.is_rework).length

  // 이탈 (churn): 이달 아카이브된 customers 중 was_recurring
  const { count: churnCount } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .gte('archived_at', `${monthStart}T00:00:00Z`)
    .eq('customer_type', 'recurring')

  // 재계약률: 계산 복잡하므로 null (설정에서 alive=false로 관리)
  const renewalRate: number | null = null

  // ─── 4. 임박 항목 top 5 ─────────────────────────────────────
  const { data: pendingDeadlines } = await supabase
    .from('deadlines')
    .select('id, title, due_date, category, consequence')
    .is('done_at', null)
    .gte('due_date', today)
    .order('due_date', { ascending: true })
    .limit(5)

  return NextResponse.json({
    ok: true,
    generated_at: new Date().toISOString(),
    intent,
    heartbeat: {
      daily_check_rate: {
        completed: completedCount,
        reacted: reactedCount,
        pct: dailyCheckPct,
      },
      weekly_notice: {
        has_this_week: !!thisWeekNotice,
        week_start: weekStart,
      },
      next_meeting_dday: {
        held_this_month: !!thisMonthMeeting?.held_at,
        dday: meetingDday,
        month_end: monthEnd,
      },
      safe_days: {
        count: Math.max(0, safeDays),
        start_date: intent.safe_days_start_date,
      },
    },
    monthly_numbers: {
      jobs_count: jobsCount ?? 0,
      claims_count: claimsCount,
      rework_count: reworkCount,
      churn_count: churnCount ?? 0,
      renewal_rate: renewalRate,
    },
    deadlines: pendingDeadlines ?? [],
  })
}
