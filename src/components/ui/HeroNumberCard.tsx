'use client'

import type { ReactNode } from 'react'
import { StatusBadge, type StatusVariant } from './StatusBadge'

/**
 * 히어로 숫자 카드 (SPEC 4.5)
 * PLAN v2 §3.7
 *
 * - 큰 숫자 + 라벨 + 단위 + 선택적 상태 뱃지
 * - null 값은 '—' 로 표시 (지표 alive=false 인 경우)
 * - trend 필드는 이번 단계에서 렌더링 안 함 (다음 phase)
 */
interface HeroNumberCardProps {
  value: number | string | null
  label: string
  unit?: string
  status?: StatusVariant
  statusLabel?: string
  helper?: string
  icon?: ReactNode
  onClick?: () => void
}

export function HeroNumberCard({
  value, label, unit, status, statusLabel, helper, icon, onClick,
}: HeroNumberCardProps) {
  const isEmpty = value === null || value === ''
  const displayValue = isEmpty ? '—' : String(value)

  const Root = onClick ? 'button' : 'div'
  const clickProps = onClick ? { onClick, type: 'button' as const } : {}

  return (
    <Root
      {...clickProps}
      className={`card-toss text-left w-full bg-surface border border-border-subtle rounded-2xl p-4 shadow-soft ${
        onClick ? 'hover:shadow-card active:scale-[0.98] transition-all' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-text-tertiary break-keep">
          {icon}
          <span>{label}</span>
        </div>
        {status && statusLabel && <StatusBadge variant={status} label={statusLabel} compact />}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className={`text-2xl font-bold leading-tight ${isEmpty ? 'text-text-tertiary' : 'text-text-primary'}`}>
          {displayValue}
        </span>
        {!isEmpty && unit && <span className="text-sm font-semibold text-text-secondary">{unit}</span>}
      </div>
      {helper && <p className="mt-1 text-xs text-text-tertiary break-keep">{helper}</p>}
    </Root>
  )
}
