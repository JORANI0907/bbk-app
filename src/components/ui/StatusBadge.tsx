'use client'

import { CheckCircle2, AlertCircle, AlertTriangle, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * 운영 상태 뱃지 (SPEC 4.2 색+아이콘+라벨 세트)
 * PLAN v2 §3.7
 *
 * 4단계 위계:
 *  - normal  : 정상 (그린)
 *  - caution : 주의 (앰버) — 이상 감지, 확인 필요
 *  - warning : 경고 (오렌지) — SLA 임박·미반응 24h 등
 *  - danger  : 위험 (레드) — 규정 위반·SLA 초과
 */
export type StatusVariant = 'normal' | 'caution' | 'warning' | 'danger'

interface StatusBadgeProps {
  variant: StatusVariant
  label: string
  compact?: boolean
  icon?: ReactNode
}

const VARIANT_CONFIG: Record<StatusVariant, { bg: string; text: string; icon: ReactNode }> = {
  normal:  { bg: 'bg-state-success-bg', text: 'text-state-success', icon: <CheckCircle2 size={12} /> },
  caution: { bg: 'bg-state-warning-bg', text: 'text-state-warning', icon: <AlertCircle size={12} /> },
  warning: { bg: 'bg-orange-50',        text: 'text-orange-700',    icon: <AlertTriangle size={12} /> },
  danger:  { bg: 'bg-state-danger-bg',  text: 'text-state-danger',  icon: <XCircle size={12} /> },
}

export function StatusBadge({ variant, label, compact = false, icon }: StatusBadgeProps) {
  const cfg = VARIANT_CONFIG[variant]
  const iconNode = icon ?? cfg.icon
  const padding = compact ? 'px-1.5 py-0.5' : 'px-2 py-1'
  return (
    <span className={`inline-flex items-center gap-1 rounded-md text-xs font-semibold ${padding} ${cfg.bg} ${cfg.text}`}>
      {iconNode}
      <span>{label}</span>
    </span>
  )
}
