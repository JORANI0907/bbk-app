'use client'

import { useState } from 'react'
import { getSubscriptionProducts, type BillingCycle } from '@/lib/kg-audit/products'

const CYCLE_OPTIONS: { value: BillingCycle; label: string; hint: string }[] = [
  { value: 'monthly', label: '월 단위', hint: '매월 자동 결제' },
  { value: 'yearly',  label: '연 단위', hint: '12개월분 선납' },
]

export default function KgAuditSubscribePage() {
  const [cycle,        setCycle]        = useState<BillingCycle>('monthly')
  const [selectedCode, setSelectedCode] = useState<string>(getSubscriptionProducts('monthly')[0].code)
  const [submitting,   setSubmitting]   = useState(false)
  const [error,        setError]        = useState('')

  const products = getSubscriptionProducts(cycle)
  const selected = products.find((p) => p.code === selectedCode) ?? products[0]
  const cycleWord = cycle === 'yearly' ? '연' : '월'

  function handleCycleChange(next: BillingCycle) {
    if (next === cycle || submitting) return
    // 같은 상품의 다른 주기 코드로 선택 유지 (sub-deep-1 ↔ sub-deep-1-yr)
    const baseCode = selectedCode.replace(/-yr$/, '')
    setCycle(next)
    setSelectedCode(next === 'yearly' ? `${baseCode}-yr` : baseCode)
  }

  async function handleCheckout() {
    if (submitting) return
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/kg-audit/checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ codes: [selectedCode] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '결제 진입 실패')
      window.location.href = data.paymentUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : '결제 진입 실패')
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-text-primary mb-2">정기 구독 서비스</h2>
        <p className="text-sm text-text-secondary">
          매달 정해진 일자에 방문하여 청소를 진행합니다. 카드 등록 후 매달 자동으로 결제됩니다.
        </p>
      </div>

      <section className="bg-surface rounded-2xl border border-border-subtle shadow-soft p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3 className="text-sm font-bold text-text-primary">상품 선택</h3>
          {/* 월 / 연 결제 주기 토글 (파스텔: 연한 배경 + 진한 글자) */}
          <div role="tablist" aria-label="결제 주기" className="inline-flex rounded-lg bg-surface-sunken p-1 gap-1">
            {CYCLE_OPTIONS.map((opt) => {
              const isActive = opt.value === cycle
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => handleCycleChange(opt.value)}
                  disabled={submitting}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    isActive
                      ? 'bg-brand-100 text-brand-800 shadow-segment'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {opt.label}
                  <span className="ml-1 font-normal text-text-tertiary">· {opt.hint}</span>
                </button>
              )
            })}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {products.map((p) => {
            const isSelected = p.code === selectedCode
            return (
              <button
                key={p.code}
                type="button"
                onClick={() => setSelectedCode(p.code)}
                disabled={submitting}
                className={`text-left rounded-xl border p-4 transition-all ${
                  isSelected
                    ? 'border-brand-600 bg-brand-50 shadow-card'
                    : 'border-border-subtle bg-surface hover:border-border-strong'
                }`}
              >
                <p className="text-xs text-text-tertiary">{p.category}</p>
                <p className="text-sm font-semibold text-text-primary mt-1">{p.label}</p>
                <p className="text-base font-bold text-brand-600 mt-2">
                  {p.price.toLocaleString('ko-KR')}원 <span className="text-xs font-normal text-text-tertiary">/ {p.unit}</span>
                </p>
              </button>
            )
          })}
        </div>
      </section>

      <section className="bg-surface rounded-2xl border border-border-subtle shadow-soft p-5">
        <div className="flex items-baseline justify-between mb-1">
          <p className="text-sm font-medium text-text-secondary">{cycleWord} 결제 금액</p>
          <p className="text-2xl font-black text-brand-600">
            {selected.price.toLocaleString('ko-KR')}<span className="text-sm font-medium">원</span>
          </p>
        </div>
        <p className="text-xs text-text-tertiary text-right mb-4">
          {cycle === 'yearly'
            ? `월 ${(selected.price / 12).toLocaleString('ko-KR')}원 × 12개월 선납`
            : '매월 동일 금액 자동 결제'}
        </p>

        {error && (
          <div className="mb-3 rounded-md bg-state-danger-bg border border-state-danger/30 px-3 py-2 text-xs text-state-danger">
            {error}
          </div>
        )}

        <button
          onClick={handleCheckout}
          disabled={submitting}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold py-3 rounded-lg transition-colors"
        >
          {submitting ? '결제 진행 중...' : '카드 등록하고 구독 시작'}
        </button>

        <p className="text-[11px] text-text-tertiary mt-3 text-center leading-relaxed">
          {cycle === 'yearly'
            ? '카드 등록 이후 12개월분이 선납 결제되며, 이후 매년 같은 날짜에 자동으로 갱신 결제됩니다.'
            : '카드 등록 이후 매달 정해진 날짜에 자동으로 결제됩니다.'}<br />
          해지는 언제든 다음 회차 7일 전까지 가능합니다.
        </p>
      </section>
    </div>
  )
}
