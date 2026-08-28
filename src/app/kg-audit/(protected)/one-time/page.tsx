'use client'

import { useMemo, useState } from 'react'
import { ONE_TIME_PRODUCTS, groupByCategory, calcTotalAmount } from '@/lib/kg-audit/products'

export default function KgAuditOneTimePage() {
  const groups = useMemo(() => groupByCategory(ONE_TIME_PRODUCTS), [])
  const [activeCategory, setActiveCategory] = useState<string>(groups[0].category)
  const [selectedCodes,  setSelectedCodes]  = useState<Set<string>>(new Set())
  const [submitting,     setSubmitting]     = useState(false)
  const [error,          setError]          = useState('')

  const totalAmount   = useMemo(() => calcTotalAmount(Array.from(selectedCodes)), [selectedCodes])
  const activeGroup   = groups.find((g) => g.category === activeCategory)!
  const selectedCount = selectedCodes.size

  function toggle(code: string) {
    setSelectedCodes((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  async function handleCheckout() {
    if (submitting || selectedCount === 0) return
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/kg-audit/checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ codes: Array.from(selectedCodes) }),
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
    <div className="space-y-4 pb-32">
      <div>
        <h2 className="text-xl font-bold text-text-primary mb-2">1회성 청소 서비스</h2>
        <p className="text-sm text-text-secondary">
          필요한 청소 항목을 카테고리별로 선택하세요. 여러 항목을 함께 선택하시면 합계 금액으로 결제됩니다.
        </p>
      </div>

      {/* 카테고리 탭 */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4">
        {groups.map((g) => {
          const isActive = g.category === activeCategory
          const selectedInGroup = g.items.filter((p) => selectedCodes.has(p.code)).length
          return (
            <button
              key={g.category}
              onClick={() => setActiveCategory(g.category)}
              className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition-all ${
                isActive
                  ? 'bg-brand-600 text-white shadow-card'
                  : 'bg-surface border border-border-subtle text-text-secondary hover:border-border-strong'
              }`}
            >
              <span>{g.icon}</span>
              <span>{g.category}</span>
              {selectedInGroup > 0 && (
                <span className={`ml-0.5 min-w-[16px] px-1 h-4 rounded-full text-[10px] font-bold flex items-center justify-center ${
                  isActive ? 'bg-white text-brand-600' : 'bg-brand-600 text-white'
                }`}>
                  {selectedInGroup}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* 품목 리스트 */}
      <section className="bg-surface rounded-2xl border border-border-subtle shadow-soft overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle flex items-center gap-2">
          <span className="text-base">{activeGroup.icon}</span>
          <h3 className="text-sm font-bold text-text-primary">{activeGroup.category}</h3>
          <span className="text-xs text-text-tertiary">({activeGroup.items.length}개 품목)</span>
        </div>
        <div className="divide-y divide-border-subtle">
          {activeGroup.items.map((p) => {
            const isChecked = selectedCodes.has(p.code)
            return (
              <label
                key={p.code}
                className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors ${
                  isChecked ? 'bg-brand-50' : 'hover:bg-surface-sunken'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(p.code)}
                  disabled={submitting}
                  className="w-4 h-4 accent-brand-600"
                />
                <div className="flex-1">
                  <p className="text-sm text-text-primary font-medium">{p.label}</p>
                  <p className="text-[11px] text-text-tertiary mt-0.5">{p.unit}</p>
                </div>
                <p className="text-sm font-bold text-text-primary">{p.price.toLocaleString('ko-KR')}원</p>
              </label>
            )
          })}
        </div>
      </section>

      {/* 하단 고정 합계바 */}
      <div className="fixed bottom-0 inset-x-0 bg-surface border-t border-border shadow-pop">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-text-tertiary">선택 {selectedCount}건 · 합계</p>
            <p className="text-lg font-black text-brand-600 leading-tight">
              {totalAmount.toLocaleString('ko-KR')}<span className="text-xs font-medium">원</span>
            </p>
            {error && <p className="text-[10px] text-state-danger mt-0.5">{error}</p>}
          </div>
          <button
            onClick={handleCheckout}
            disabled={submitting || selectedCount === 0}
            className="bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-5 py-3 rounded-lg text-sm transition-colors"
          >
            {submitting ? '진입 중...' : '결제하기'}
          </button>
        </div>
      </div>
    </div>
  )
}
