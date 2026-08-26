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

// 오늘이 속한 주의 월요일 (YYYY-MM-DD)
function getWeekStartMonday(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  const dow = d.getUTCDay() // 0=Sun, 1=Mon, ...
  const diff = dow === 0 ? -6 : 1 - dow
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
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

  // 7~8) 출퇴근 지표 (attendance_rate / ontime_work_rate)
  const needsAttendance = activeConfigs.some(c => c.key === 'attendance_rate' && c.calculation === 'auto')
  const needsOntimeWork = activeConfigs.some(c => c.key === 'ontime_work_rate' && c.calculation === 'auto')

  if (needsAttendance || needsOntimeWork) {
    // 이달 배정 (work_assignments) + 시공 시간(construction_time) 조인
    const { data: assignments } = await supabase
      .from('work_assignments')
      .select('worker_id, construction_date, application_id, service_applications!inner(construction_time)')
      .gte('construction_date', monthStart)
      .lt('construction_date', monthEnd)

    // 이달 clock_in 이 있는 attendance 조회
    const { data: att } = await supabase
      .from('attendance')
      .select('worker_id, work_date, clock_in')
      .gte('work_date', monthStart)
      .lt('work_date', monthEnd)
      .not('clock_in', 'is', null)

    // (worker_id, work_date) → clock_in 매핑
    const attMap = new Map<string, string>()
    for (const a of att ?? []) {
      if (a.worker_id && a.work_date && a.clock_in) {
        attMap.set(`${a.worker_id}|${a.work_date}`, a.clock_in as string)
      }
    }

    const totalAssignments = (assignments ?? []).length
    let attendedCount = 0
    let ontimeCount = 0
    let ontimeEligible = 0 // construction_time 이 있어야 정시 판정 가능

    for (const wa of assignments ?? []) {
      if (!wa.worker_id || !wa.construction_date) continue
      const clockIn = attMap.get(`${wa.worker_id}|${wa.construction_date}`)
      if (clockIn) attendedCount += 1

      // construction_time 파싱 (배열/객체 두 형태 방어)
      const sa = wa.service_applications as { construction_time?: string | null } | { construction_time?: string | null }[] | null
      const constructionTime = Array.isArray(sa) ? sa[0]?.construction_time : sa?.construction_time
      if (!constructionTime) continue
      ontimeEligible += 1
      if (!clockIn) continue

      // construction_time (HH:MM:SS) + construction_date → 예정 시각 (KST 로컬)
      const [hh, mm] = String(constructionTime).split(':').map(Number)
      const scheduledKst = new Date(`${wa.construction_date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`)
      const actualMs = new Date(clockIn).getTime()
      const diffMin = Math.abs(actualMs - scheduledKst.getTime()) / 60000
      if (diffMin <= 30) ontimeCount += 1
    }

    if (needsAttendance) {
      actuals['attendance_rate'] = totalAssignments > 0 ? Math.round((attendedCount / totalAssignments) * 100) : null
    }
    if (needsOntimeWork) {
      // 정시 판정 가능한 배정만 분모로 (시공시간 없는 배정 제외)
      actuals['ontime_work_rate'] = ontimeEligible > 0 ? Math.round((ontimeCount / ontimeEligible) * 100) : null
    }
  }

  // 9) equipment_care_rate: 이번 주 활성 작업자 중 정기관리 사진 제출 비율
  const needsEquipmentCare = activeConfigs.some(c => c.key === 'equipment_care_rate' && c.calculation === 'auto')
  if (needsEquipmentCare) {
    const weekStart = getWeekStartMonday(today)
    // 활성 작업자 수 (users.role='worker' AND is_active=true)
    const { count: activeWorkerCount } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'worker')
      .eq('is_active', true)
    // 이번 주 제출 건수
    const { count: submittedCount } = await supabase
      .from('equipment_care_records')
      .select('id', { count: 'exact', head: true })
      .eq('week_start', weekStart)

    const total = activeWorkerCount ?? 0
    const submitted = submittedCount ?? 0
    actuals['equipment_care_rate'] = total > 0 ? Math.round((submitted / total) * 100) : null
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
