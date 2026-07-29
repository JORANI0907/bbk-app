'use client'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'brand'
  className?: string
}

/**
 * 뱃지 컴포넌트 (Toss 스타일 5색 룰)
 *
 * - default: 회색 (기본 상태)
 * - brand: 브랜드 컬러 (진행중, 활성)
 * - success: 그린 (완료, 입금 완료)
 * - warning: 앰버 (주의, 예약 당일)
 * - danger: 레드 (이상, 미배정)
 * - info: 스카이블루 (안내)
 *
 * 시멘틱 토큰(bg-state-*-bg, text-state-*) 사용으로 하드코딩 컬러 제거.
 */
export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  const variantStyles = {
    default: 'bg-surface-sunken text-text-secondary',
    brand: 'bg-brand-50 text-brand-700',
    success: 'bg-state-success-bg text-state-success',
    warning: 'bg-state-warning-bg text-state-warning',
    danger: 'bg-state-danger-bg text-state-danger',
    info: 'bg-state-info-bg text-state-info',
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  )
}
