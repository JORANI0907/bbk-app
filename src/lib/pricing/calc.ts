/**
 * 비용 계산 — 순수 함수 (DB·DOM 의존 없음, 단위 테스트 대상).
 *
 * 흐름: 견적자가 적은 (인원, 1명당 시간) → 1명당 시간 × 난이도 시간계수
 *      → 총 작업시간 = 인원 × 1명당 시간 (1인 최대를 넘으면 경고만, 인원은 바꾸지 않는다)
 *      → 금액 = 총 작업시간 × 시간당 단가 × 단가계수 − 추가인원 할인, 1인 상한 × 인원 이하
 *      → 정기면 × 정기 계수 (회당) → 할증 → 할인 → 최소금액 → 반올림(잔돈 할인) → 부가세
 */
import type { CalcInput, CalcLine, CalcResult, DiscountRule, PricingConfig, SurchargeRule } from './types'
import { isRegular } from './types'

const round0 = (n: number) => Math.round(n)
const round1 = (n: number) => Math.round(n * 10) / 10
const pct = (base: number, percent: number) => round0(base * percent / 100)

interface Staffing {
  inputHours: number; timeFactor: number; priceFactor: number
  workers: number; hoursPerWorker: number; totalHours: number
}

/** 입력한 인원·1명당 시간에 난이도 계수를 적용해 총 작업시간을 낸다 */
function resolveStaffing(cfg: PricingConfig, input: CalcInput): Staffing {
  const grade = cfg.difficulty_grades.find((g) => g.id === input.difficulty_id) ?? cfg.difficulty_grades[0]
  const timeFactor = grade?.time_factor ?? 1
  const priceFactor = grade?.price_factor ?? 1
  const workers = Math.max(0, Math.floor(input.workers ?? 0))
  const inputHours = Math.max(0, input.hours_per_worker ?? 0)
  const hoursPerWorker = round1(inputHours * timeFactor)
  return { inputHours, timeFactor, priceFactor, workers, hoursPerWorker, totalHours: round1(workers * hoursPerWorker) }
}

function staffingWarnings(cfg: PricingConfig, s: Staffing): string[] {
  const out: string[] = []
  if (s.workers <= 0) out.push('투입 인원을 입력하세요.')
  if (s.inputHours <= 0) out.push('1명당 시간을 입력하세요.')
  if (s.workers > cfg.max_workers) out.push(`최대 투입 인원(${cfg.max_workers}명)을 넘습니다.`)
  if (s.hoursPerWorker > cfg.max_hours_per_worker) {
    out.push(`난이도 적용 후 1명당 시간(${s.hoursPerWorker}시간)이 1인 최대(${cfg.max_hours_per_worker}시간)를 넘습니다. 인원을 늘리는 것을 검토하세요.`)
  }
  return out
}

function applySurcharges(cfg: PricingConfig, input: CalcInput, base: number): CalcLine[] {
  const lines: CalcLine[] = []
  for (const rule of cfg.surcharges) {
    if (!rule.enabled || input.disabled_rule_ids.includes(rule.id)) continue
    const amount = surchargeAmount(rule, input, base)
    if (amount > 0) lines.push({ label: rule.name, amount })
  }
  return lines
}

function surchargeAmount(rule: SurchargeRule, input: CalcInput, base: number): number {
  switch (rule.kind) {
    case 'distance_tiers': {
      if (input.distance_km == null) return 0
      const km = input.distance_km
      const tier = rule.tiers.find((t) => km >= t.from_km && (t.to_km == null || km < t.to_km))
      return tier?.amount ?? 0
    }
    case 'urgent_days':
      return input.days_until_visit != null && input.days_until_visit <= rule.within_days ? pct(base, rule.percent) : 0
    case 'fixed':
      return rule.amount
    case 'percent':
      return pct(base, rule.percent)
  }
}

function applyDiscounts(cfg: PricingConfig, input: CalcInput, base: number): CalcLine[] {
  const lines: CalcLine[] = []
  for (const rule of cfg.discounts) {
    if (!rule.enabled || input.disabled_rule_ids.includes(rule.id)) continue
    const amount = discountAmount(rule, input, base)
    if (amount > 0) lines.push({ label: rule.name, amount })
  }
  return lines
}

function discountAmount(rule: DiscountRule, input: CalcInput, base: number): number {
  switch (rule.kind) {
    case 'contract_months':
      return input.contract_months != null && input.contract_months >= rule.min_months ? pct(base, rule.percent) : 0
    case 'prepaid':
      return input.prepaid ? pct(base, rule.percent) : 0
    case 'renewal_year': {
      if (input.renewal_year == null) return 0
      const tier = [...rule.tiers].sort((a, b) => b.min_year - a.min_year).find((t) => input.renewal_year! >= t.min_year)
      return tier ? pct(base, tier.percent) : 0
    }
    case 'branch_count': {
      if (input.branch_count == null) return 0
      const tier = [...rule.tiers].sort((a, b) => b.min_branches - a.min_branches).find((t) => input.branch_count! >= t.min_branches)
      return tier ? pct(base, tier.percent) : 0
    }
    case 'percent':
      return pct(base, rule.percent)
  }
}

export function calculatePrice(cfg: PricingConfig, input: CalcInput): CalcResult {
  const s = resolveStaffing(cfg, input)
  const { priceFactor, workers, hoursPerWorker, totalHours } = s
  const warnings = staffingWarnings(cfg, s)

  const gross = round0(totalHours * cfg.hourly_rate * priceFactor)
  const extraDiscount = Math.max(0, workers - 1) * cfg.extra_worker_discount
  const cap = cfg.max_revenue_per_worker * workers
  const beforeCap = Math.max(0, gross - extraDiscount)
  const cappedByMax = cap > 0 && beforeCap > cap
  const onetime = cappedByMax ? cap : beforeCap

  const regular = isRegular(input.service_type)
  const regularFactor = regular ? cfg.regular_factor : 1
  const perVisit = round0(onetime * regularFactor)

  const surcharges = applySurcharges(cfg, input, perVisit)
  const afterSurcharge = perVisit + surcharges.reduce((s, l) => s + l.amount, 0)
  const discounts = applyDiscounts(cfg, input, afterSurcharge)
  let subtotal = afterSurcharge - discounts.reduce((s, l) => s + l.amount, 0)
  if (cfg.min_amount > 0 && subtotal < cfg.min_amount) {
    warnings.push(`최소 청구 금액(${cfg.min_amount.toLocaleString()}원)을 적용했습니다.`)
    subtotal = cfg.min_amount
  }

  const unit = Math.max(1, cfg.rounding_unit)
  const supply = Math.floor(subtotal / unit) * unit
  const rounding = subtotal - supply
  const vat = round0(supply * 0.1)
  const total = supply + vat

  const visits = regular ? (input.visits_per_month ?? 1) : null
  const monthly = visits != null ? total * visits : null
  const annual = monthly != null ? monthly * (input.contract_months ?? 12) : null

  const laborCost = round0(totalHours * cfg.hourly_labor_cost)
  const margin = supply - laborCost

  return {
    input_hours_per_worker: s.inputHours, time_factor: s.timeFactor,
    workers, hours_per_worker: hoursPerWorker, total_hours: totalHours,
    over_max_hours: hoursPerWorker > cfg.max_hours_per_worker, over_max_workers: workers > cfg.max_workers,
    gross, extra_worker_discount: extraDiscount, capped_by_max_revenue: cappedByMax, onetime_amount: onetime,
    regular_factor: regularFactor, per_visit_amount: perVisit,
    surcharges, discounts, subtotal, rounding_discount: rounding, supply_amount: supply, vat_amount: vat, total_amount: total,
    monthly_amount: monthly, annual_amount: annual,
    labor_cost: laborCost, margin, margin_rate: supply > 0 ? Math.round((margin / supply) * 1000) / 10 : 0,
    warnings,
  }
}

export function emptyInput(service_type: CalcInput['service_type'], cfg: PricingConfig): CalcInput {
  return {
    service_type,
    difficulty_id: cfg.difficulty_grades[0]?.id ?? '',
    workers: 1, hours_per_worker: null,
    distance_km: null, days_until_visit: null,
    visits_per_month: isRegular(service_type) ? 1 : null,
    contract_months: isRegular(service_type) ? 12 : null,
    prepaid: false, renewal_year: null, branch_count: null,
    disabled_rule_ids: [],
  }
}
