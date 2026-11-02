/**
 * 작업완료 시 "추가 서비스 추천" 입력을 요구할지 결정 (2026-11-03)
 *
 * 고객관리 > 투입 일정 설정에서 고른 "추천 서비스 입력 요일"(visit_cycle_config.recommend_weekdays)에
 * 해당하는 회차에서만 추천 입력을 필수로 한다. 요일을 하나도 고르지 않았으면 예전처럼 매번 필수.
 * 배정관리(WorkPanel)와 작업자 앱 작업완료 화면이 같은 규칙을 쓴다.
 */

import type { VisitCycleConfig } from '@/lib/schedule-generator'

export function isRecommendRequired(config: VisitCycleConfig | null | undefined, dateIso: string | null | undefined): boolean {
  const days = config?.recommend_weekdays
  if (!Array.isArray(days) || days.length === 0) return true
  if (!dateIso) return true
  const d = new Date(`${dateIso.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(d.getTime())) return true
  return days.includes(d.getDay())
}
