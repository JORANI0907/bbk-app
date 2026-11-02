'use client'

/**
 * 고객용 결제 페이지 공용 뼈대
 *   /portone/billing-pay (청구서 결제) · /portone/billing-register (자동결제 카드 등록) 가 같은 모습을 갖도록
 *   머리말 + 카드 섹션 + 안내 목록 + 회사 정보 푸터를 여기서 한 번만 정의한다.
 *
 * 2026-11-03: 장식 제거 — 잉크 밴드·종이 질감·세리프 금액 폰트를 걷어내고
 *   앱 전체와 같은 토큰(bg-surface, shadow-soft, rounded-2xl, Pretendard)만 쓰는 담백한 구성으로 정리.
 */

import type { ReactNode } from 'react'
import { Check, Clock, MessageCircle } from 'lucide-react'
import styles from './billing-ui.module.css'

export const SUPPORT = {
  phone: '1522-9597',
  mobile: '010-5434-4877',
  hours: '평일·토요일 09:00 – 18:00 (일요일·공휴일 휴무)',
  kakao: 'http://pf.kakao.com/_JTNxin',
  company: '범빌드코리아 주식회사',
  bizNo: '398-81-04260',
}

/** 결제 페이지 전용 강조색 — 앱 브랜드색(brand-600)보다 밝고 청량한 하늘색. 결제 버튼은 Button 기본색을 덮어쓴다. */
export const CTA_CLASS = '!bg-sky-500 hover:!bg-sky-600 text-white'

export const won = (n: number) => `${n.toLocaleString('ko-KR')}원`
export const fmtDate = (iso: string) => (iso ? iso.slice(0, 10).replace(/-/g, '.') : '-')

/** 큰 금액 숫자 — 본문과 같은 폰트, 고정폭 숫자만 적용 */
export function Figure({ amount, size = 'lg' }: { amount: number; size?: 'md' | 'lg' | 'xl' }) {
  const cls = size === 'xl' ? 'text-3xl' : size === 'lg' ? 'text-2xl' : 'text-lg'
  const unit = size === 'xl' ? 'text-lg' : size === 'lg' ? 'text-base' : 'text-sm'
  return (
    <span className={`${cls} font-semibold tabular-nums tracking-tight text-text-primary`}>
      {amount.toLocaleString('ko-KR')}<span className={`${unit} font-medium ml-0.5 text-text-secondary`}>원</span>
    </span>
  )
}

export function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-text-tertiary whitespace-nowrap">{k}</dt>
      <dd className="text-text-primary text-right break-keep">{v}</dd>
    </>
  )
}

export function Notes({ items }: { items: Array<{ Icon: typeof Clock; text: string }> }) {
  return (
    <ul className="space-y-3">
      {items.map(({ Icon, text }, i) => (
        <li key={i} className="flex items-start gap-3 text-sm text-text-secondary leading-normal break-keep">
          <Icon size={16} strokeWidth={1.75} className="text-sky-500 shrink-0 mt-0.5" />
          <span>{text}</span>
        </li>
      ))}
    </ul>
  )
}

/** 흰 카드 한 장 = 섹션 하나 */
export function Section({ title, delay, children }: { title?: string; delay: number; children: ReactNode }) {
  return (
    <section
      className={`${styles.reveal} bg-surface rounded-2xl border border-border-subtle shadow-soft p-5 sm:p-6`}
      style={{ animationDelay: `${60 + delay * 70}ms` }}
    >
      {title && <h2 className="text-sm font-semibold text-text-primary mb-4">{title}</h2>}
      {children}
    </section>
  )
}

/** 머리말 + 카드 묶음 + 푸터 */
export function Shell({ kicker, businessName, subtitle, tone = 'default', children }: {
  kicker: string
  businessName: string
  subtitle: string
  tone?: 'default' | 'done'
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-surface-sunken">
      <header className="bg-gradient-to-b from-sky-100 via-sky-50 to-surface border-b border-sky-100">
        <div className="max-w-lg mx-auto px-5 sm:px-6 pt-8 pb-6">
          <p className="text-xs font-medium text-sky-600">{kicker}</p>
          <h1 className="mt-2 text-2xl font-semibold text-text-primary leading-tight break-keep">{businessName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
            <span>{subtitle}</span>
            {tone === 'done' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-state-success-bg px-2.5 py-0.5 text-xs font-medium text-state-success">
                <Check size={12} /> 완료
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 sm:px-6 py-5 pb-16 space-y-4">
        {children}

        <footer className="px-2 pt-2 text-xs text-text-tertiary leading-normal space-y-1 break-keep">
          <p className="font-medium text-text-secondary">{SUPPORT.company} · 사업자등록번호 {SUPPORT.bizNo}</p>
          <p>고객센터 {SUPPORT.phone} · {SUPPORT.mobile} · {SUPPORT.hours}</p>
          <p>
            <a href={SUPPORT.kakao} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-text-secondary underline underline-offset-2">
              <MessageCircle size={12} /> 카카오톡 상담
            </a>
          </p>
        </footer>
      </main>
    </div>
  )
}
