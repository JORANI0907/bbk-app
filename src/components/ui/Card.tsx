'use client'

interface CardProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}

/**
 * 카드 컴포넌트 (Toss 스타일)
 *
 * - 정적 카드: shadow-soft + border-border-subtle
 * - 클릭 가능한 카드(onClick 전달): hover 시 살짝 뜨고 그림자 강화 (card-toss 유틸리티)
 */
export function Card({ children, className = '', onClick }: CardProps) {
  const base =
    'bg-surface rounded-2xl shadow-soft border border-border-subtle'
  const interactive = onClick
    ? 'card-toss cursor-pointer'
    : ''

  return (
    <div
      className={`${base} ${interactive} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  )
}
