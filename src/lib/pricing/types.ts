/**
 * 서비스 비용 기준 — 타입. 견적자가 적은 (인원, 1명당 시간) × 난이도 → 총 작업시간 → 금액.
 * 품목표는 두지 않는다 (2026-11-23 대표 결정: 서비스 4종 × 난이도만).
 * 규모(평수) 구간도 두지 않는다 (2026-11-23 대표 결정: 헷갈려서 제거. 시간은 전문가가 현장을 보고 직접 적는다).
 */

export type PricingServiceType = 'onetime_deep' | 'onetime_end' | 'regular_deep' | 'regular_end'

export const SERVICE_TYPE_LABELS: Record<PricingServiceType, string> = {
  onetime_deep: '1회성케어 (딥)',
  onetime_end: '1회성케어 (엔드)',
  regular_deep: '정기딥케어',
  regular_end: '정기엔드케어',
}

export const SERVICE_TYPES: PricingServiceType[] = ['onetime_deep', 'onetime_end', 'regular_deep', 'regular_end']

export const isRegular = (t: PricingServiceType) => t === 'regular_deep' || t === 'regular_end'

export interface DifficultyGrade {
  id: string
  name: string
  /** 견적자가 고를 때 보는 판단 기준 */
  criteria: string
  /** 견적자가 적은 1명당 시간(시/1인)에 곱함 */
  time_factor: number
  /** 시간당 단가에 곱함 (대부분 1.0) */
  price_factor: number
}

export interface DistanceTier { from_km: number; to_km: number | null; amount: number }

export type SurchargeRule =
  | { id: string; name: string; enabled: boolean; kind: 'distance_tiers'; tiers: DistanceTier[] }
  | { id: string; name: string; enabled: boolean; kind: 'urgent_days'; within_days: number; percent: number }
  | { id: string; name: string; enabled: boolean; kind: 'fixed'; amount: number }
  | { id: string; name: string; enabled: boolean; kind: 'percent'; percent: number }

export type DiscountRule =
  | { id: string; name: string; enabled: boolean; kind: 'contract_months'; min_months: number; percent: number }
  | { id: string; name: string; enabled: boolean; kind: 'prepaid'; percent: number }
  | { id: string; name: string; enabled: boolean; kind: 'renewal_year'; tiers: Array<{ min_year: number; percent: number }> }
  | { id: string; name: string; enabled: boolean; kind: 'branch_count'; tiers: Array<{ min_branches: number; percent: number }> }
  | { id: string; name: string; enabled: boolean; kind: 'percent'; percent: number }

export interface PricingConfig {
  hourly_rate: number
  hourly_labor_cost: number
  /** 난이도 적용 후 1명당 시간이 이 값을 넘으면 경고 */
  max_hours_per_worker: number
  max_revenue_per_worker: number
  max_workers: number
  extra_worker_discount: number
  min_amount: number
  rounding_unit: number
  /** 정기 서비스만: 1회성 산출 금액에 곱해 회당 금액을 만든다 */
  regular_factor: number
  difficulty_grades: DifficultyGrade[]
  surcharges: SurchargeRule[]
  discounts: DiscountRule[]
}

export interface PricingRuleRow {
  id: string
  service_type: PricingServiceType
  version_no: number
  config: PricingConfig
  is_current: boolean
  note: string | null
  created_by: string | null
  created_at: string
}

/** 계산기 입력 — 선택 사항은 생략 가능 */
export interface CalcInput {
  service_type: PricingServiceType
  difficulty_id: string
  /** 투입 인원. 견적자가 현장을 보고 적는다 */
  workers: number | null
  /** 1명당 작업시간(시/1인), 난이도 적용 전. 견적자가 적는다 */
  hours_per_worker: number | null
  distance_km: number | null
  days_until_visit: number | null
  /** 정기 전용 */
  visits_per_month: number | null
  contract_months: number | null
  prepaid: boolean
  renewal_year: number | null
  branch_count: number | null
  /** 수동으로 끄고 켜는 규칙 id (비어 있으면 enabled 규칙 전부 적용) */
  disabled_rule_ids: string[]
}

export interface CalcLine { label: string; amount: number; note?: string }

export interface CalcResult {
  /** 입력한 1명당 시간 (난이도 적용 전) */
  input_hours_per_worker: number
  time_factor: number
  /** 확정 인원·1인당 시간(난이도 적용 후)·총 작업시간(인원 × 1인당 시간) */
  workers: number
  hours_per_worker: number
  total_hours: number
  /** 난이도 적용 후 1명당 시간이 1인 최대를 넘었는지 */
  over_max_hours: boolean
  over_max_workers: boolean
  gross: number
  extra_worker_discount: number
  capped_by_max_revenue: boolean
  onetime_amount: number
  regular_factor: number
  per_visit_amount: number
  surcharges: CalcLine[]
  discounts: CalcLine[]
  subtotal: number
  rounding_discount: number
  supply_amount: number
  vat_amount: number
  total_amount: number
  monthly_amount: number | null
  annual_amount: number | null
  /** 내부용 */
  labor_cost: number
  margin: number
  margin_rate: number
  warnings: string[]
}
