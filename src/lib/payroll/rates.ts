import { createServiceClient } from '@/lib/supabase/server'
import { DEFAULT_RATES_2026 } from './types'
import type { TaxRateMap } from './types'

/**
 * 급여 귀속월(year/month) 기준으로 DB에서 요율을 조회한다.
 * 조회 실패 시 DEFAULT_RATES_2026을 폴백으로 반환하고 경고를 남긴다.
 */
export async function fetchRatesForPeriod(
  year: number,
  month: number,
): Promise<TaxRateMap> {
  const supabase = createServiceClient()
  const periodDate = `${year}-${String(month).padStart(2, '0')}-01`

  const { data, error } = await supabase
    .from('tax_rate_config')
    .select('key, value')
    .lte('effective_from', periodDate)
    .or(`effective_to.is.null,effective_to.gte.${periodDate}`)

  if (error || !data || data.length === 0) {
    console.warn('[payroll/rates] DB 요율 조회 실패, 기본값(2026) 사용:', error?.message)
    return DEFAULT_RATES_2026
  }

  const map: Record<string, number> = {}
  for (const row of data) {
    map[row.key] = Number(row.value)
  }

  return {
    national_pension_employee:     map['national_pension_employee']     ?? DEFAULT_RATES_2026.national_pension_employee,
    national_pension_employer:     map['national_pension_employer']     ?? DEFAULT_RATES_2026.national_pension_employer,
    national_pension_cap:          map['national_pension_cap']          ?? DEFAULT_RATES_2026.national_pension_cap,
    national_pension_floor:        map['national_pension_floor']        ?? DEFAULT_RATES_2026.national_pension_floor,
    health_insurance_employee:     map['health_insurance_employee']     ?? DEFAULT_RATES_2026.health_insurance_employee,
    health_insurance_employer:     map['health_insurance_employer']     ?? DEFAULT_RATES_2026.health_insurance_employer,
    ltc_insurance_total:           map['ltc_insurance_total']           ?? DEFAULT_RATES_2026.ltc_insurance_total,
    employment_insurance_employee: map['employment_insurance_employee'] ?? DEFAULT_RATES_2026.employment_insurance_employee,
    employment_insurance_employer: map['employment_insurance_employer'] ?? DEFAULT_RATES_2026.employment_insurance_employer,
    employment_stability:          map['employment_stability']          ?? DEFAULT_RATES_2026.employment_stability,
    industrial_accident_rate:      map['industrial_accident_rate']      ?? DEFAULT_RATES_2026.industrial_accident_rate,
    wage_claim_guarantee:          map['wage_claim_guarantee']          ?? DEFAULT_RATES_2026.wage_claim_guarantee,
    severance_accrual:             map['severance_accrual']             ?? DEFAULT_RATES_2026.severance_accrual,
    local_income_tax:              map['local_income_tax']              ?? DEFAULT_RATES_2026.local_income_tax,
    standard_monthly_hours:        map['standard_monthly_hours']        ?? DEFAULT_RATES_2026.standard_monthly_hours,
    minimum_hourly_wage:           map['minimum_hourly_wage']           ?? DEFAULT_RATES_2026.minimum_hourly_wage,
    meal_allowance_limit:          map['meal_allowance_limit']          ?? DEFAULT_RATES_2026.meal_allowance_limit,
    car_allowance_limit:           map['car_allowance_limit']           ?? DEFAULT_RATES_2026.car_allowance_limit,
    daily_worker_deduction:        map['daily_worker_deduction']        ?? DEFAULT_RATES_2026.daily_worker_deduction,
    daily_worker_tax_rate:         map['daily_worker_tax_rate']         ?? DEFAULT_RATES_2026.daily_worker_tax_rate,
    business_income_tax:           map['business_income_tax']           ?? DEFAULT_RATES_2026.business_income_tax,
    avg_weeks_per_month:           map['avg_weeks_per_month']           ?? DEFAULT_RATES_2026.avg_weeks_per_month,
  }
}
