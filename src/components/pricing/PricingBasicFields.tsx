'use client'

import { NumberField } from './NumberField'
import { isRegular, type PricingConfig, type PricingServiceType } from '@/lib/pricing/types'

interface Props {
  serviceType: PricingServiceType
  config: PricingConfig
  onChange: (next: PricingConfig) => void
}

type NumKey = 'hourly_rate' | 'hourly_labor_cost' | 'max_hours_per_worker' | 'max_revenue_per_worker' | 'max_workers' | 'extra_worker_discount' | 'min_amount' | 'rounding_unit' | 'regular_factor'

const FIELDS: Array<{ key: NumKey; label: string; suffix: string; step?: number; hint?: string; regularOnly?: boolean }> = [
  { key: 'hourly_rate', label: '시간당 서비스 단가', suffix: '원', step: 1000, hint: '고객 요금의 기본. 총 작업시간(인원 × 시/1인) × 단가' },
  { key: 'hourly_labor_cost', label: '시간당 인건비', suffix: '원', step: 500, hint: '내부 원가. 마진 계산에만 사용' },
  { key: 'max_hours_per_worker', label: '1인 최대 작업시간', suffix: '시/1인', step: 0.5, hint: '난이도 적용 후 1명당 시간이 이 값을 넘으면 인원을 자동으로 늘림' },
  { key: 'max_revenue_per_worker', label: '1인 최대 매출 상한', suffix: '원', step: 10000, hint: '금액이 상한 × 인원을 넘지 않음. 0 = 상한 없음' },
  { key: 'max_workers', label: '최대 투입 인원', suffix: '명', hint: '넘으면 경고만 표시' },
  { key: 'extra_worker_discount', label: '추가 인원 1명당 할인', suffix: '원', step: 10000 },
  { key: 'min_amount', label: '최소 청구 금액', suffix: '원', step: 10000, hint: '0 = 없음' },
  { key: 'rounding_unit', label: '잔돈 할인 단위', suffix: '원', step: 100, hint: '공급가를 이 단위로 내림 (견적서 잔돈 할인과 동일)' },
  { key: 'regular_factor', label: '정기 계수', suffix: '배', step: 0.05, hint: '1회성 산출 금액 × 계수 = 회당 금액', regularOnly: true },
]

export function PricingBasicFields({ serviceType, config, onChange }: Props) {
  const regular = isRegular(serviceType)
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {FIELDS.filter((f) => !f.regularOnly || regular).map((f) => (
        <NumberField
          key={f.key}
          label={f.label}
          suffix={f.suffix}
          step={f.step}
          hint={f.hint}
          value={config[f.key]}
          onChange={(v) => onChange({ ...config, [f.key]: v ?? 0 })}
        />
      ))}
    </div>
  )
}
