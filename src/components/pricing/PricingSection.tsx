'use client'

/**
 * 비용 기준·계산기 공용 섹션 카드 — 위계가 한눈에 보이도록 3단으로 나눈다 (2026-11-23 대표 지시).
 *   1단 PricingSection: 번호 + 제목이 있는 큰 카드. 머리 부분에 연한 색을 깔아 섹션 시작이 바로 보인다.
 *                       tone='result' 는 입력 카드와 구분되도록 조금 더 진한 파스텔.
 *   2단 SubGroup: 카드 안의 묶음(할증/할인, 거리·일정 등). 살짝 가라앉은 배경 + 얇은 테두리 + 왼쪽 색 막대 제목.
 *   3단 Row: 묶음 안의 한 줄(등급 행, 규칙 행). 흰 배경 + 얇은 테두리라 가라앉은 묶음 위에 떠 보인다.
 */
import type { ReactNode } from 'react'

type Tone = 'input' | 'result'

const TONE: Record<Tone, { card: string; head: string; badge: string }> = {
  input: { card: 'border-border', head: 'bg-brand-50 border-brand-100', badge: 'bg-brand-100 text-brand-800' },
  result: { card: 'border-brand-200', head: 'bg-brand-100 border-brand-200', badge: 'bg-brand-200 text-brand-900' },
}

interface SectionProps { n: number; title: string; hint?: string; tone?: Tone; children: ReactNode }

export function PricingSection({ n, title, hint, tone = 'input', children }: SectionProps) {
  const t = TONE[tone]
  return (
    <section className={`bg-surface border ${t.card} rounded-2xl shadow-soft overflow-hidden`}>
      <header className={`flex items-start gap-3 px-4 md:px-5 py-3 border-b ${t.head}`}>
        <span className={`shrink-0 w-7 h-7 rounded-full ${t.badge} text-xs font-bold flex items-center justify-center`}>{n}</span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-snug text-text-primary">{title}</h3>
          {hint && <p className="text-xs text-text-secondary mt-0.5 break-keep">{hint}</p>}
        </div>
      </header>
      <div className="p-4 md:p-5 space-y-4">{children}</div>
    </section>
  )
}

interface SubGroupProps { title: string; hint?: string; children: ReactNode }

export function SubGroup({ title, hint, children }: SubGroupProps) {
  return (
    <div className="bg-surface-sunken border border-border-subtle rounded-xl p-3 md:p-4 space-y-3">
      <div className="border-l-2 border-brand-300 pl-2">
        <p className="text-sm font-semibold text-text-primary leading-snug">{title}</p>
        {hint && <p className="text-xs text-text-tertiary mt-0.5 break-keep">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

/** 3단: 묶음 안의 한 줄 */
export const ROW_CLASS = 'bg-surface border border-border-subtle rounded-lg p-3'
