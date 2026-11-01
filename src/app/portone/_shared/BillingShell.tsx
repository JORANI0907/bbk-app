'use client'

/**
 * 고객용 결제 페이지 공용 뼈대 (2026-11-01)
 *   /portone/billing-pay (청구서 결제) · /portone/billing-register (자동결제 카드 등록) 가 같은 모습을 갖도록
 *   잉크 밴드 + 종이 카드 + 안내 목록 + 회사 정보 푸터를 여기서 한 번만 정의한다.
 */

import type { ReactNode } from 'react'
import { Fraunces } from 'next/font/google'
import { Check, Clock, MessageCircle } from 'lucide-react'
import styles from './billing-ui.module.css'

export const figureFont = Fraunces({ subsets: ['latin'], weight: ['500', '600'], display: 'swap' })
export { styles as billingStyles }

export const SUPPORT = {
  phone: '1522-9597',
  mobile: '010-5434-4877',
  hours: '평일·토요일 09:00 – 18:00 (일요일·공휴일 휴무)',
  kakao: 'http://pf.kakao.com/_JTNxin',
  company: '범빌드코리아 주식회사',
  bizNo: '398-81-04260',
}

export const won = (n: number) => `${n.toLocaleString('ko-KR')}원`
export const fmtDate = (iso: string) => (iso ? iso.slice(0, 10).replace(/-/g, '.') : '-')

/** 큰 금액 숫자 (세리프 디스플레이 + 고정폭 숫자) */
export function Figure({ amount, size = 'lg' }: { amount: number; size?: 'md' | 'lg' | 'xl' }) {
  const cls = size === 'xl' ? 'text-4xl' : size === 'lg' ? 'text-3xl' : 'text-xl'
  const unit = size === 'xl' ? 'text-xl' : size === 'lg' ? 'text-base' : 'text-sm'
  return (
    <span className={`${figureFont.className} ${styles.figure} ${cls} text-text-primary`}>
      {amount.toLocaleString('ko-KR')}<span className={`font-sans ${unit} ml-1 text-text-secondary`}>원</span>
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
          <Icon size={16} strokeWidth={1.75} className="text-brand-600 shrink-0 mt-0.5" />
          <span>{text}</span>
        </li>
      ))}
    </ul>
  )
}

export function Section({ title, delay, children }: { title?: string; delay: number; children: ReactNode }) {
  return (
    <section className={`${styles.reveal} px-5 py-5 sm:px-6`} style={{ animationDelay: `${80 + delay * 90}ms` }}>
      {title && <h2 className="text-xs font-semibold tracking-widest text-text-tertiary uppercase mb-4">{title}</h2>}
      {children}
    </section>
  )
}

/** 상단 잉크 밴드 + 겹쳐 올라오는 종이 카드 */
export function Shell({ kicker, businessName, subtitle, dueDate, tone = 'default', children }: {
  kicker: string
  businessName: string
  subtitle: string
  dueDate?: string
  tone?: 'default' | 'done'
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-surface-sunken">
      <header className={`${styles.band} text-white`}>
        <div className="max-w-lg mx-auto px-5 sm:px-6 pt-8 pb-24">
          <p className="text-xs tracking-widest uppercase text-brand-200">{kicker}</p>
          <h1 className="mt-3 text-2xl sm:text-3xl font-semibold leading-tight break-keep">{businessName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-brand-100">
            <span>{subtitle}</span>
            {dueDate && (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-xs text-white">
                <Clock size={12} /> 결제 기한 {fmtDate(dueDate)}
              </span>
            )}
            {tone === 'done' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-state-success-bg px-2.5 py-0.5 text-xs text-state-success font-medium">
                <Check size={12} /> 완료
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 sm:px-6 -mt-16 pb-16">
        <div className={`${styles.paper} rounded-2xl border border-border-subtle shadow-card divide-y divide-border-subtle overflow-hidden`}>
          {children}
        </div>

        <footer className="mt-6 px-2 text-xs text-text-tertiary leading-normal space-y-1 break-keep">
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
