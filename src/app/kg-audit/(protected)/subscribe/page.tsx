'use client'

import { useState } from 'react'
import { SUBSCRIPTION_PRODUCTS } from '@/lib/kg-audit/products'

export default function KgAuditSubscribePage() {
  const [selectedCode, setSelectedCode] = useState<string>(SUBSCRIPTION_PRODUCTS[0].code)
  const [submitting,   setSubmitting]   = useState(false)
  const [error,        setError]        = useState('')

  const selected = SUBSCRIPTION_PRODUCTS.find((p) => p.code === selectedCode)!

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
        <h3 className="text-sm font-bold text-text-primary mb-3">상품 선택</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {SUBSCRIPTION_PRODUCTS.map((p) => {
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
        <div className="flex items-baseline justify-between mb-4">
          <p className="text-sm font-medium text-text-secondary">월 결제 금액</p>
          <p className="text-2xl font-black text-brand-600">
            {selected.price.toLocaleString('ko-KR')}<span className="text-sm font-medium">원</span>
          </p>
        </div>

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
          카드 등록 이후 매달 정해진 날짜에 자동으로 결제됩니다.<br />
          해지는 언제든 다음 회차 7일 전까지 가능합니다.
        </p>
      </section>
    </div>
  )
}
