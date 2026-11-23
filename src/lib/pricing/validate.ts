/** PricingConfig 저장 전 검사 — 숫자 범위와 필수 배열. 순수 함수. */
import type { PricingConfig } from './types'

const num = (v: unknown, min = 0) => typeof v === 'number' && Number.isFinite(v) && v >= min

export function validatePricingConfig(cfg: unknown): { ok: true; config: PricingConfig } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const c = (cfg ?? {}) as Partial<PricingConfig> & Record<string, unknown>

  const fields: Array<[keyof PricingConfig, string, number]> = [
    ['hourly_rate', '시간당 단가', 1], ['hourly_labor_cost', '시간당 인건비', 0], ['max_hours_per_worker', '1인 최대 시간', 1],
    ['max_revenue_per_worker', '1인 최대 매출', 0], ['max_workers', '최대 인원', 1], ['extra_worker_discount', '추가 인원 할인', 0],
    ['min_amount', '최소 금액', 0], ['rounding_unit', '반올림 단위', 1], ['regular_factor', '정기 계수', 0],
  ]
  for (const [key, label, min] of fields) if (!num(c[key], min)) errors.push(`${label}: ${min} 이상 숫자여야 합니다`)

  if (!Array.isArray(c.difficulty_grades) || c.difficulty_grades.length === 0) errors.push('난이도 등급이 1개 이상 필요합니다')
  else c.difficulty_grades.forEach((g, i) => {
    if (!g.id || !g.name?.trim()) errors.push(`난이도 ${i + 1}: 이름 필요`)
    if (!num(g.time_factor, 0.1) || !num(g.price_factor, 0.1)) errors.push(`난이도 ${g.name ?? i + 1}: 계수는 0.1 이상`)
  })

  if (!Array.isArray(c.surcharges)) errors.push('할증 규칙 형식 오류')
  if (!Array.isArray(c.discounts)) errors.push('할인 규칙 형식 오류')

  const ids = [...(c.surcharges ?? []), ...(c.discounts ?? [])].map((r) => r.id)
  if (new Set(ids).size !== ids.length) errors.push('할증·할인 규칙 id 가 중복됩니다')

  if (errors.length) return { ok: false, errors }
  // 예전 판에 남아 있던 규모 구간(size_tiers)은 더 쓰지 않으므로 저장하지 않는다
  const config = { ...c }
  delete config.size_tiers
  return { ok: true, config: config as PricingConfig }
}
