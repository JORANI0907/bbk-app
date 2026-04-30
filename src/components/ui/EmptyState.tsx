'use client'

import { ReactNode } from 'react'

interface EmptyStateProps {
  /**
   * 이모지 문자열(예: '📋') 또는 ReactNode(SVG 아이콘 등)
   */
  icon?: string | ReactNode
  title: string
  description?: string
  /**
   * 우측 또는 하단 CTA — 버튼, 링크 등
   */
  action?: ReactNode
  /**
   * 내부 패딩 크기:
   * - sm: 카드 안 빈 영역용
   * - md: 페이지 빈 상태 (기본)
   * - lg: 풀스크린 빈 상태
   */
  size?: 'sm' | 'md' | 'lg'
  /**
   * 점선 테두리 박스로 감쌀지 (페이지 레벨 빈 상태에서 유용)
   */
  bordered?: boolean
  className?: string
}

/**
 * 데이터 없음 / 결과 없음 화면 통일 컴포넌트.
 * - 모든 페이지가 동일한 빈 상태 톤을 갖도록 강제
 *
 * 사용:
 *   <EmptyState icon="📋" title="등록된 공지사항이 없습니다" />
 *
 *   <EmptyState
 *     icon="🏢"
 *     title="연결된 고객 정보가 없습니다"
 *     description="관리자에게 문의해주세요."
 *     bordered
 *   />
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  size = 'md',
  bordered = false,
  className = '',
}: EmptyStateProps) {
  const paddingStyles = {
    sm: 'py-8 px-4',
    md: 'py-12 px-6',
    lg: 'py-20 px-6',
  }

  const iconSize = {
    sm: 'text-3xl',
    md: 'text-4xl',
    lg: 'text-5xl',
  }

  const wrapperStyles = bordered
    ? 'rounded-2xl border border-dashed border-border bg-surface'
    : ''

  return (
    <div
      className={`flex flex-col items-center justify-center text-center gap-3 ${paddingStyles[size]} ${wrapperStyles} ${className}`}
    >
      {icon && (
        <span className={`${iconSize[size]} leading-none`} aria-hidden="true">
          {icon}
        </span>
      )}
      <p className="text-sm font-semibold text-text-primary leading-snug">{title}</p>
      {description && (
        <p className="text-xs text-text-tertiary leading-relaxed max-w-xs">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
