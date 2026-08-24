/**
 * Batch A-3: 활성 지표 실적값 자동 계산 API
 *
 * GET /api/admin/ops/metrics/values?month=YYYY-MM
 *   admin 만 · 활성(alive) + auto 지표들의 실적값을 계산해서 반환.
 *
 * 지원 지표:
 *   - new_inquiries        이달 service_applications 신규 카운트
 *   - daily_check_rate     오늘 완료된 작업 중 관리자 반응 비율
 *   - claims_count         이달 claims 카운트
 *   - revenue_onetime_rate 1회성케어 매출 / 목표 × 100
 *   - revenue_deep_rate    정기딥케어 매출 / 목표 × 100  (연간 포함)
 *   - revenue_end_rate     정기엔드케어 매출 / 목표 × 100
 *
 * 매출 계산은 /api/admin/finance 와 동일 기준 유지 (숫자 불일치 방지):
 *   - 1회성: service_applications.supply_amount + vat  (시공 완료 기준)
 *   - 정기(딥/엔드): service_billings.amount           (결제완료 paid_date 기준)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

interface MetricValue {
  key: string
  label: string
  unit: string
  direction: string
  target: number | null
  actual: number | null
  pct: number | null
  calculation: string
  show_on_dashboard: boolean
}

function getKstToday(): string {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 3600 * 1000)
  return kst.toISOString().slice(0, 10)
}

function getMonthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number)
  const start = `${month}-01`
  const nextMonth = new Date(Date.UTC(y, m, 1))
  const end = nextMonth.toISOString().slice(0, 10) // 다음달 1일 (< 로 비교)
  return { start, end }
}

export async function GET(request: NextRequest) {
  const session = getServerSession()
  if (!session) return NextResponse.json({ ok: false, error: '인증 필요' }, { status: 401 })
  if (session.role !== 'admin') {
    return NextResponse.json({ ok: false, error: '관리자만 접근 가능' }, { status: 403 })
  }

  const supabase = createServiceClient()
  const today = getKstToday()
  const month = request.nextUrl.searchParams.get('month') ?? today.slice(0, 7)
  const { start: monthStart, end: monthEnd } = getMonthRange(month)

  // 활성 지표 로드
  const { data: configs, error: cfgErr } = await supabase
    .from('metrics_config')
    .select('key, label, unit, direction, target_value, calculation, show_on_dashboard, alive')
    .eq('alive', true)
    .order('sort_order', { ascending: true })

  if (cfgErr) return NextResponse.json({ ok: false, error: cfgErr.message }, { status: 500 })

  const activeConfigs = (configs ?? []).filter(c => c.alive)

  // 지표별 실적 계산 (auto 지표만)
  const actuals: Record<string, number | null> = {}

  // 1) new_inquiries: 이달 service_applications 신규 카운트
  const needsNewInquiries = activeConfigs.some(c => c.key === 'new_inquiries' && c.calculation === 'auto')
  if (needsNewInquiries) {
    const { count } = await supabase
      .from('service_applications')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', `${monthStart}T00:00:00Z`)
      .lt('created_at', `${monthEnd}T00:00:00Z`)
    actuals['new_inquiries'] = count ?? 0
  }

  // 2) daily_check_rate: 오늘 완료 작업 중 관리자 반응 비율
  const needsDailyCheck = activeConfigs.some(c => c.key === 'daily_check_rate' && c.calculation === 'auto')
  if (needsDailyCheck) {
    const { data: todayApps } = await supabase
      .from('service_applications')
      .select('id, admin_reacted_by')
      .eq('construction_date', today)
      .not('work_completed_at', 'is', null)
    const total = todayApps?.length ?? 0
    const reacted = (todayApps ?? []).filter(a => a.admin_reacted_by).length
    actuals['daily_check_rate'] = total > 0 ? Math.round((reacted / total) * 100) : null
  }

  // 3) claims_count: 이달 claims 카운트
  const needsClaims = activeConfigs.some(c => c.key === 'claims_count' && c.calculation === 'auto')
  if (needsClaims) {
    const { count } = await supabase
      .from('claims')
      .select('id', { count: 'exact', head: true })
      .gte('occurred_at', `${monthStart}T00:00:00Z`)
      .lt('occurred_at', `${monthEnd}T00:00:00Z`)
    actuals['claims_count'] = count ?? 0
  }

  // 4~6) 분야별 매출 (finance API 로직과 동일 기준)
  const needsOnetime = activeConfigs.some(c => c.key === 'revenue_onetime_rate' && c.calculation === 'auto')
  const needsDeep = activeConfigs.some(c => c.key === 'revenue_deep_rate' && c.calculation === 'auto')
  const needsEnd = activeConfigs.some(c => c.key === 'revenue_end_rate' && c.calculation === 'auto')

  if (needsOnetime) {
    // 1회성케어: 이달 시공완료 (work_completed_at) 기준. finance API 와 동일 필터.
    const { data: rows } = await supabase
      .from('service_applications')
      .select('supply_amount, vat')
      .eq('service_type', '1회성케어')
      .gte('construction_date', monthStart)
      .lt('construction_date', monthEnd)
      .not('work_completed_at', 'is', null)
    const total = (rows ?? []).reduce((s, r) => s + (Number(r.supply_amount) || 0) + (Number(r.vat) || 0), 0)
    actuals['__revenue_onetime'] = total
  }

  if (needsDeep) {
    // 정기딥케어(월간+연간 통합): 이달 paid_date 기준 결제완료 이력
    const { data: rows } = await supabase
      .from('service_billings')
      .select('amount, customers!inner(customer_type)')
      .not('paid_date', 'is', null)
      .gte('paid_date', monthStart)
      .lt('paid_date', monthEnd)
      .eq('customers.customer_type', '정기딥케어')
    const total = (rows ?? []).reduce((s, r) => s + (Number(r.amount) || 0), 0)
    actuals['__revenue_deep'] = total
  }

  if (needsEnd) {
    // 정기엔드케어: 이달 paid_date 기준
    const { data: rows } = await supabase
      .from('service_billings')
      .select('amount, customers!inner(customer_type)')
      .not('paid_date', 'is', null)
      .gte('paid_date', monthStart)
      .lt('paid_date', monthEnd)
      .eq('customers.customer_type', '정기엔드케어')
    const total = (rows ?? []).reduce((s, r) => s + (Number(r.amount) || 0), 0)
    actuals['__revenue_end'] = total
  }

  // 최종 응답 조립
  const metrics: MetricValue[] = activeConfigs.map(c => {
    const target = c.target_value !== null ? Number(c.target_value) : null

    let actual: number | null = null
    let pct: number | null = null

    if (c.calculation === 'auto') {
      // 매출 3종은 실적(원)을 목표(원)로 나눠서 % 로 표시
      if (c.key === 'revenue_onetime_rate') {
        actual = actuals['__revenue_onetime'] ?? null
      } else if (c.key === 'revenue_deep_rate') {
        actual = actuals['__revenue_deep'] ?? null
      } else if (c.key === 'revenue_end_rate') {
        actual = actuals['__revenue_end'] ?? null
      } else {
        actual = actuals[c.key] ?? null
      }

      if (c.unit === '%' && target && target > 0 && actual !== null) {
        pct = Math.round((actual / target) * 100)
      } else if (c.unit !== '%' && target && target > 0 && actual !== null) {
        // % 아닌 지표도 달성률 계산 (건수/일수 등)
        pct = Math.round((actual / target) * 100)
      }
    }

    return {
      key: c.key,
      label: c.label,
      unit: c.unit,
      direction: c.direction,
      target,
      actual,
      pct,
      calculation: c.calculation,
      show_on_dashboard: c.show_on_dashboard,
    }
  })

  return NextResponse.json({
    ok: true,
    generated_at: new Date().toISOString(),
    month,
    metrics,
  })
}
