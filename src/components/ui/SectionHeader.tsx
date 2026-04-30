'use client'

import { ReactNode } from 'react'

interface SectionHeaderProps {
  title: string | ReactNode
  subtitle?: string | ReactNode
  /**
   * 우측 액션 영역 — 버튼, 링크, 필터, 카운트 뱃지 등
   */
  action?: ReactNode
  /**
   * level 별 크기:
   * - page: 페이지 메인 타이틀 (text-2xl md:text-3xl)
   * - section: 섹션 타이틀 (text-lg)  ← 기본값
   * - sub: 서브섹션 타이틀 (text-base)
   */
  level?: 'page' | 'section' | 'sub'
  className?: string
}

/**
 * 페이지/섹션 제목 통일 컴포넌트.
 * - 제목 + 선택적 부제 + 우측 액션
 * - 모든 페이지가 같은 위계로 보이도록 강제
 *
 * 사용:
 *   <SectionHeader level="page" title="고객 관리" subtitle="총 245개 업체" />
 *   <SectionHeader title="공지사항" action={<Button size="sm">+ 새 공지</Button>} />
 */
export function SectionHeader({
  title,
  subtitle,
  action,
  level = 'section',
  className = '',
}: SectionHeaderProps) {
  const titleStyles = {
    page: 'text-2xl md:text-3xl font-bold text-text-primary leading-tight tracking-tight',
    section: 'text-lg font-bold text-text-primary leading-snug',
    sub: 'text-base font-semibold text-text-primary leading-snug',
  }

  const subtitleStyles = {
    page: 'text-sm text-text-secondary mt-1.5',
    section: 'text-xs text-text-tertiary mt-1',
    sub: 'text-xs text-text-tertiary mt-0.5',
  }

  return (
    <div className={`flex items-start justify-between gap-3 ${className}`}>
      <div className="min-w-0 flex-1">
        <h2 className={titleStyles[level]}>{title}</h2>
        {subtitle && <p className={subtitleStyles[level]}>{subtitle}</p>}
      </div>
      {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
    </div>
  )
}
