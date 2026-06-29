/**
 * 고객 쾌적 지수 계산 유틸
 * customer 포털과 franchise 포털에서 동일 공식을 사용하기 위해 분리.
 *
 * - 범위 쾌적지수: 최근 완료 일정의 condition_score 평균 (1→100, 2→80, 3→50)
 * - 범위 외 쾌적지수: recommended_services priority 평균 → 0~100 정규화
 * - 진행률: 이번달 completed / total * 100
 */

export type CustomerGrade = '화이트' | '블루' | '블랙'

export type RecommendedServiceRaw = {
  name: string
  reason?: string
  priority: string
}

export interface ClosingChecklistRow {
  condition_score: number | null
  recommended_services: unknown
  customer_comment: string | null
}

export interface RecentScheduleRow {
  id: string
  scheduled_date: string | null
  closing_checklists: ClosingChecklistRow[] | null
}

export interface MonthlyScheduleRow {
  id: string
  status: string
}

export const CONDITION_SCORE_POINTS: Record<number, number> = {
  1: 100,
  2: 80,
  3: 50,
}

export const PRIORITY_POINTS: Record<string, number> = {
  high: 30,
  medium: 40,
  low: 50,
}

export function calcComfortIndex(recentSchedules: RecentScheduleRow[]): number | null {
  const scores = recentSchedules
    .map((r) => r.closing_checklists?.[0]?.condition_score ?? null)
    .filter((s): s is number => s !== null)
    .map((s) => CONDITION_SCORE_POINTS[s] ?? 0)
  if (scores.length === 0) return null
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
}

export function calcOuterComfortIndex(recentSchedules: RecentScheduleRow[]): number | null {
  const points = recentSchedules.flatMap((r) => {
    const recs = r.closing_checklists?.[0]?.recommended_services
    if (!Array.isArray(recs)) return []
    return (recs as RecommendedServiceRaw[]).map((s) => PRIORITY_POINTS[s.priority] ?? 40)
  })
  if (points.length === 0) return null
  const avgRaw = points.reduce((a, b) => a + b, 0) / points.length
  return Math.round(((avgRaw - 30) / 20) * 100)
}

export function calcProgressPct(monthlySchedules: MonthlyScheduleRow[]): number | null {
  if (monthlySchedules.length === 0) return null
  const completed = monthlySchedules.filter((s) => s.status === 'completed').length
  return Math.round((completed / monthlySchedules.length) * 100)
}

export interface CustomerIndices {
  comfortIndex: number | null
  outerComfortIndex: number | null
  progressPct: number | null
}

export function calcAllIndices(
  recentSchedules: RecentScheduleRow[],
  monthlySchedules: MonthlyScheduleRow[]
): CustomerIndices {
  return {
    comfortIndex: calcComfortIndex(recentSchedules),
    outerComfortIndex: calcOuterComfortIndex(recentSchedules),
    progressPct: calcProgressPct(monthlySchedules),
  }
}

/**
 * 여러 지점의 지수를 평균내어 총괄 지수 산출.
 * null인 지점은 제외하고 평균.
 */
export function aggregateIndices(indicesList: CustomerIndices[]): CustomerIndices {
  const avg = (key: keyof CustomerIndices): number | null => {
    const values = indicesList
      .map((i) => i[key])
      .filter((v): v is number => v !== null)
    if (values.length === 0) return null
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
  }
  return {
    comfortIndex: avg('comfortIndex'),
    outerComfortIndex: avg('outerComfortIndex'),
    progressPct: avg('progressPct'),
  }
}

/**
 * 게이지 설명 (고객 홈 + 프렌차이즈 대시보드에서 공통 사용).
 * 단일 진실 소스 — 문구 변경 시 한 곳만 수정.
 */
export const GAUGE_DESCRIPTIONS = {
  comfort:
    '고객님이 받고 계신 범위에 대한 작업 후 쾌적 지수입니다. 쾌적지수가 낮은 경우 계약 전 보다 작업 전 오염이 더 높아졌을 가능성이 있어요.',
  outerComfort:
    '요청하신 범위 외에 BBK 위생 파트너가 확인한 위생이 부족한 부분의 지수입니다. 추가 케어를 요청하여 더 깨끗한 공간을 유지해보세요.',
  progress: '이번달에 진행하기로 약속한 일정 달성률입니다.',
} as const

export function gaugeStrokeColor(pct: number | null): string {
  if (pct === null) return '#94a3b8'
  if (pct >= 85) return '#34d399'
  if (pct >= 65) return '#fbbf24'
  return '#f87171'
}
