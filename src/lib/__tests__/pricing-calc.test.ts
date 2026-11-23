import { describe, it, expect } from 'vitest'
import { calculatePrice, emptyInput } from '@/lib/pricing/calc'
import { DEFAULT_PRICING } from '@/lib/pricing/defaults'
import { validatePricingConfig } from '@/lib/pricing/validate'

const deep = DEFAULT_PRICING.onetime_deep // 1인 최대 10시간, 단가 50,000, 1인 상한 500,000, 추가 인원 할인 50,000, 최대 3명

describe('calculatePrice — 1회성 딥', () => {
  it('입력한 인원·1명당 시간에 난이도 계수를 곱한다 (1명 × 10시간 · 보통)', () => {
    const r = calculatePrice(deep, { ...emptyInput('onetime_deep', deep), workers: 1, hours_per_worker: 10, difficulty_id: 'normal' })
    expect(r.input_hours_per_worker).toBe(10)
    expect(r.time_factor).toBe(1)
    expect(r.workers).toBe(1)
    expect(r.hours_per_worker).toBe(10)
    expect(r.total_hours).toBe(10)
    expect(r.gross).toBe(500000)
    expect(r.onetime_amount).toBe(500000)
    expect(r.total_amount).toBe(550000)
    expect(r.warnings).toEqual([])
  })

  it('난이도로 1인 최대를 넘으면 인원을 바꾸지 않고 경고만 한다 (1명 × 10시간 · 심함 → 13시간)', () => {
    const r = calculatePrice(deep, { ...emptyInput('onetime_deep', deep), workers: 1, hours_per_worker: 10, difficulty_id: 'heavy' })
    expect(r.workers).toBe(1)
    expect(r.hours_per_worker).toBe(13)
    expect(r.total_hours).toBe(13)
    expect(r.over_max_hours).toBe(true)
    expect(r.warnings.some((w) => w.includes('1인 최대'))).toBe(true)
    // 650,000 이지만 1인 상한 500,000 × 1명에 걸린다
    expect(r.gross).toBe(650000)
    expect(r.capped_by_max_revenue).toBe(true)
    expect(r.onetime_amount).toBe(500000)
  })

  it('2명이면 추가 인원 할인이 빠지고 상한은 2배가 된다 (2명 × 6시간)', () => {
    const r = calculatePrice(deep, { ...emptyInput('onetime_deep', deep), workers: 2, hours_per_worker: 6 })
    expect(r.total_hours).toBe(12)
    expect(r.gross).toBe(600000)
    expect(r.extra_worker_discount).toBe(50000)
    expect(r.capped_by_max_revenue).toBe(false)
    expect(r.onetime_amount).toBe(550000)
  })

  it('1명당 시간을 비워 두면 금액 0 + 입력 안내', () => {
    const r = calculatePrice(deep, emptyInput('onetime_deep', deep))
    expect(r.total_hours).toBe(0)
    expect(r.total_amount).toBe(0)
    expect(r.warnings.some((w) => w.includes('1명당 시간을 입력'))).toBe(true)
  })

  it('최대 인원 초과 시 경고한다', () => {
    const r = calculatePrice(deep, { ...emptyInput('onetime_deep', deep), workers: 5, hours_per_worker: 8 })
    expect(r.over_max_workers).toBe(true)
    expect(r.warnings.some((w) => w.includes('최대 투입 인원'))).toBe(true)
  })

  it('천원 미만은 잔돈 할인으로 떨어낸다', () => {
    const cfg = { ...deep, hourly_rate: 33333 }
    const r = calculatePrice(cfg, { ...emptyInput('onetime_deep', cfg), workers: 1, hours_per_worker: 3 })
    expect(r.subtotal).toBe(99999)
    expect(r.supply_amount).toBe(99000)
    expect(r.rounding_discount).toBe(999)
  })
})

describe('calculatePrice — 정기딥', () => {
  const cfg = DEFAULT_PRICING.regular_deep // 정기 계수 0.8
  const base = { ...emptyInput('regular_deep', cfg), workers: 1, hours_per_worker: 4 }

  it('정기 계수와 재계약 할인, 월·연 금액을 계산한다', () => {
    const r = calculatePrice(cfg, { ...base, visits_per_month: 1, contract_months: 12, renewal_year: 2 })
    // 4시간 × 50,000 = 200,000 → ×0.8 = 160,000 → 재계약 2년차 15% = 24,000 → 136,000
    expect(r.per_visit_amount).toBe(160000)
    expect(r.discounts).toEqual([{ label: '재계약', amount: 24000 }])
    expect(r.supply_amount).toBe(136000)
    expect(r.total_amount).toBe(149600)
    expect(r.monthly_amount).toBe(149600)
    expect(r.annual_amount).toBe(149600 * 12)
  })

  it('꺼진 규칙과 수동으로 끈 규칙은 적용하지 않는다', () => {
    const r = calculatePrice(cfg, { ...base, renewal_year: 3, branch_count: 5, disabled_rule_ids: ['renewal'] })
    expect(r.discounts).toEqual([])
  })

  it('할증은 켜져 있을 때만, 거리 구간에 맞춰 붙는다', () => {
    const on = { ...cfg, surcharges: cfg.surcharges.map((s) => ({ ...s, enabled: true })) }
    const r = calculatePrice(on, { ...base, distance_km: 45, days_until_visit: 1 })
    expect(r.surcharges.map((l) => l.label)).toEqual(['원거리 출장', '긴급 예약'])
    expect(r.surcharges[0].amount).toBe(30000)
    expect(r.surcharges[1].amount).toBe(32000) // 160,000 × 20%
  })

  it('내부 원가와 마진을 함께 낸다', () => {
    const r = calculatePrice(cfg, base)
    expect(r.labor_cost).toBe(110000)
    expect(r.margin).toBe(160000 - 110000)
    expect(r.margin_rate).toBe(31.3)
  })
})

describe('validatePricingConfig', () => {
  it('예전 판에 남은 규모 구간(size_tiers)은 저장본에서 뺀다', () => {
    const legacy = { ...deep, size_tiers: [{ id: 's', name: '소' }] }
    const check = validatePricingConfig(legacy)
    expect(check.ok).toBe(true)
    if (check.ok) expect('size_tiers' in check.config).toBe(false)
  })

  it('난이도 등급이 없으면 거절한다', () => {
    const check = validatePricingConfig({ ...deep, difficulty_grades: [] })
    expect(check.ok).toBe(false)
  })
})
