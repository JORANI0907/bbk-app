/**
 * 초기 기준값 — 노션 "공간케어 비용 산정 내규"(OP-05) 숫자를 옮긴 것.
 * 탭에서 수정하면 새 버전으로 저장되므로 이 파일은 "처음 한 번" 과 "초기화" 용도.
 * 인원·1명당 시간은 기준값에 두지 않는다 — 견적자가 계산기에서 현장을 보고 직접 적는다.
 */
import type { PricingConfig, PricingServiceType } from './types'

const GRADES = [
  { id: 'normal', name: '보통', criteria: '일상 오염. 기름때 얇음, 장비 정상, 접근 쉬움', time_factor: 1.0, price_factor: 1.0 },
  { id: 'heavy', name: '심함', criteria: '기름때 두꺼움 또는 6개월 이상 미청소, 일부 분해 필요', time_factor: 1.3, price_factor: 1.0 },
  { id: 'severe', name: '매우 심함', criteria: '탄화·고착 오염, 장비 노후, 고소·협소 작업 포함', time_factor: 1.6, price_factor: 1.0 },
]

const SURCHARGES: PricingConfig['surcharges'] = [
  { id: 'distance', name: '원거리 출장', enabled: false, kind: 'distance_tiers', tiers: [{ from_km: 30, to_km: 60, amount: 30000 }, { from_km: 60, to_km: null, amount: 60000 }] },
  { id: 'urgent', name: '긴급 예약', enabled: false, kind: 'urgent_days', within_days: 2, percent: 20 },
  { id: 'scope_over', name: '표준범위 초과(수동)', enabled: false, kind: 'fixed', amount: 0 },
]

const DISCOUNTS_REGULAR: PricingConfig['discounts'] = [
  { id: 'contract12', name: '12개월 계약', enabled: false, kind: 'contract_months', min_months: 12, percent: 5 },
  { id: 'prepaid', name: '1년 선납', enabled: false, kind: 'prepaid', percent: 5 },
  { id: 'renewal', name: '재계약', enabled: true, kind: 'renewal_year', tiers: [{ min_year: 2, percent: 15 }, { min_year: 3, percent: 25 }] },
  { id: 'branches', name: '다지점(공동계약)', enabled: false, kind: 'branch_count', tiers: [{ min_branches: 3, percent: 5 }, { min_branches: 5, percent: 10 }] },
]

const base = (over: Partial<PricingConfig>): PricingConfig => ({
  hourly_rate: 0, hourly_labor_cost: 0, max_hours_per_worker: 8, max_revenue_per_worker: 0, max_workers: 2,
  extra_worker_discount: 0, min_amount: 0, rounding_unit: 1000, regular_factor: 1,
  difficulty_grades: GRADES, surcharges: SURCHARGES, discounts: [],
  ...over,
})

export const DEFAULT_PRICING: Record<PricingServiceType, PricingConfig> = {
  onetime_end: base({ hourly_rate: 35000, hourly_labor_cost: 17500, max_hours_per_worker: 8, max_revenue_per_worker: 280000, max_workers: 2, extra_worker_discount: 40000 }),
  onetime_deep: base({ hourly_rate: 50000, hourly_labor_cost: 27500, max_hours_per_worker: 10, max_revenue_per_worker: 500000, max_workers: 3, extra_worker_discount: 50000 }),
  regular_end: base({ hourly_rate: 30000, hourly_labor_cost: 15000, max_hours_per_worker: 8, max_revenue_per_worker: 240000, max_workers: 2, extra_worker_discount: 50000, regular_factor: 1, discounts: DISCOUNTS_REGULAR }),
  regular_deep: base({ hourly_rate: 50000, hourly_labor_cost: 27500, max_hours_per_worker: 10, max_revenue_per_worker: 500000, max_workers: 3, extra_worker_discount: 50000, regular_factor: 0.8, discounts: DISCOUNTS_REGULAR }),
}
