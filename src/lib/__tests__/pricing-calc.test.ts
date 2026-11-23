import { describe, it, expect } from 'vitest'
import { calculatePrice, emptyInput } from '@/lib/pricing/calc'
import { DEFAULT_PRICING } from '@/lib/pricing/defaults'

const deep = DEFAULT_PRICING.onetime_deep // 중: 1명 × 10시/1인, 1인 최대 10시간, 단가 50,000, 추가 인원 할인 50,000

describe('calculatePrice — 1회성 딥', () => {
  it('규모의 인원·1명당 시간에 난이도 계수를 곱한다 (중·보통 → 1명 × 10시간)', () => {
    const r = calculatePrice(deep, { ...emptyInput('onetime_deep', deep), size_tier_id: 'm', difficulty_id: 'normal' })
    expect(r.base_workers).toBe(1)
    expect(r.base_hours_per_worker).toBe(10)
    expect(r.workers).toBe(1)
    expect(r.hours_per_worker).toBe(10)
    expect(r.total_hours).toBe(10)
    expect(r.gross).toBe(500000)
    expect(r.onetime_amount).toBe(500000)
    expect(r.total_amount).toBe(550000)
  })

  it('난이도로 1명당 시간이 1인 최대를 넘으면 인원을 늘려 나눈다 (중·심함 → 13시간 → 2명 × 6.5)', () => {
    const r = calculatePrice(deep, { ...emptyInput('onetime_deep', deep), size_tier_id: 'm', difficulty_id: 'heavy' })
    expect(r.workers_increased).toBe(true)
    expect(r.workers).toBe(2)
    expect(r.hours_per_worker).toBe(6.5)
    expect(r.total_hours).toBe(13)
    expect(r.gross).toBe(650000)
    expect(r.extra_worker_discount).toBe(50000)
    expect(r.onetime_amount).toBe(600000)
    expect(r.warnings.some((w) => w.includes('늘렸습니다'))).toBe(true)
  })

  it('전문가가 인원과 1명당 시간을 덮어쓰면 그 값을 쓴다', () => {
    const r = calculatePrice(deep, { ...emptyInput('onetime_deep', deep), size_tier_id: 'm', difficulty_id: 'heavy', workers_override: 1, hours_per_worker_override: 6 })
    expect(r.workers).toBe(1)
    expect(r.hours_per_worker).toBe(6)
    expect(r.total_hours).toBe(6)
    expect(r.onetime_amount).toBe(300000)
  })

  it('덮어쓴 1명당 시간이 1인 최대를 넘으면 경고만 한다', () => {
    const r = calculatePrice(deep, { ...emptyInput('onetime_deep', deep), workers_override: 1, hours_per_worker_override: 12 })
    expect(r.workers).toBe(1)
    expect(r.warnings.some((w) => w.includes('1인 최대'))).toBe(true)
  })

  it('1인 상한 × 인원을 넘지 않는다', () => {
    const r = calculatePrice(deep, { ...emptyInput('onetime_deep', deep), workers_override: 2, hours_per_worker_override: 15 })
    expect(r.capped_by_max_revenue).toBe(true)
    expect(r.onetime_amount).toBe(1000000)
  })

  it('최대 인원 초과 시 경고한다', () => {
    const r = calculatePrice(deep, { ...emptyInput('onetime_deep', deep), workers_override: 5, hours_per_worker_override: 8 })
    expect(r.over_max_workers).toBe(true)
    expect(r.warnings.some((w) => w.includes('최대 투입 인원'))).toBe(true)
  })

  it('천원 미만은 잔돈 할인으로 떨어낸다', () => {
    const cfg = { ...deep, hourly_rate: 33333 }
    const r = calculatePrice(cfg, { ...emptyInput('onetime_deep', cfg), workers_override: 1, hours_per_worker_override: 3 })
    expect(r.subtotal).toBe(99999)
    expect(r.supply_amount).toBe(99000)
    expect(r.rounding_discount).toBe(999)
  })
})

describe('calculatePrice — 정기딥', () => {
  const cfg = DEFAULT_PRICING.regular_deep // 소: 1명 × 4시간, 정기 계수 0.8

  it('정기 계수와 재계약 할인, 월·연 금액을 계산한다', () => {
    const r = calculatePrice(cfg, { ...emptyInput('regular_deep', cfg), size_tier_id: 's', difficulty_id: 'normal', visits_per_month: 1, contract_months: 12, renewal_year: 2 })
    // 4시간 × 50,000 = 200,000 → ×0.8 = 160,000 → 재계약 2년차 15% = 24,000 → 136,000
    expect(r.per_visit_amount).toBe(160000)
    expect(r.discounts).toEqual([{ label: '재계약', amount: 24000 }])
    expect(r.supply_amount).toBe(136000)
    expect(r.total_amount).toBe(149600)
    expect(r.monthly_amount).toBe(149600)
    expect(r.annual_amount).toBe(149600 * 12)
  })

  it('꺼진 규칙과 수동으로 끈 규칙은 적용하지 않는다', () => {
    const r = calculatePrice(cfg, { ...emptyInput('regular_deep', cfg), renewal_year: 3, branch_count: 5, disabled_rule_ids: ['renewal'] })
    expect(r.discounts).toEqual([])
  })

  it('할증은 켜져 있을 때만, 거리 구간에 맞춰 붙는다', () => {
    const on = { ...cfg, surcharges: cfg.surcharges.map((s) => ({ ...s, enabled: true })) }
    const r = calculatePrice(on, { ...emptyInput('regular_deep', on), size_tier_id: 's', distance_km: 45, days_until_visit: 1 })
    expect(r.surcharges.map((l) => l.label)).toEqual(['원거리 출장', '긴급 예약'])
    expect(r.surcharges[0].amount).toBe(30000)
    expect(r.surcharges[1].amount).toBe(32000) // 160,000 × 20%
  })

  it('내부 원가와 마진을 함께 낸다', () => {
    const r = calculatePrice(cfg, { ...emptyInput('regular_deep', cfg), size_tier_id: 's' })
    expect(r.labor_cost).toBe(110000)
    expect(r.margin).toBe(160000 - 110000)
    expect(r.margin_rate).toBe(31.3)
  })
})
