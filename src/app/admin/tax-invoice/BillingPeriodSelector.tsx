'use client'

import { useState } from 'react'
import { X, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export interface BillingPeriodItem {
  billing_id: string
  billing_period: string
  billing_type: 'monthly' | 'annual'
  amount: number
  supply_amount: number
  vat: number
  billing_status: 'pending' | 'paid' | 'overdue'
  tax_invoice_issued: boolean
  tax_invoice_issued_date: string | null
  due_date: string | null
}

interface Props {
  customerName: string
  serviceType: string | null
  periods: BillingPeriodItem[]
  customerId: string
  onClose: () => void
  onIssued: (billingIds: string[]) => Promise<void>
}

const fmtKr = (n: number) => n.toLocaleString('ko-KR')

function formatPeriod(period: string, type: 'monthly' | 'annual'): string {
  if (type === 'annual') return `${period}년 연간`
  if (period.length === 7) return `${period.slice(0, 4)}년 ${period.slice(5, 7)}월`
  return period
}

export function BillingPeriodSelector({ customerName, serviceType, periods, onClose, onIssued }: Props) {
  const issuablePeriods = periods.filter(p => p.billing_status === 'paid' && !p.tax_invoice_issued)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(issuablePeriods.map(p => p.billing_id))
  )
  const [submitting, setSubmitting] = useState(false)

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedIds.size === issuablePeriods.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(issuablePeriods.map(p => p.billing_id)))
    }
  }

  const selectedPeriods = issuablePeriods.filter(p => selectedIds.has(p.billing_id))
  const selectedTotal = selectedPeriods.reduce((s, p) => s + p.amount, 0)

  const handleSubmit = async () => {
    if (selectedIds.size === 0) return
    setSubmitting(true)
    try {
      await onIssued([...selectedIds])
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-lg">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border-subtle">
          <div>
            <p className="text-[11px] text-text-tertiary">{serviceType}</p>
            <h2 className="text-base font-bold text-text-primary mt-0.5">{customerName}</h2>
            <p className="text-xs text-text-secondary mt-1">발행할 기간을 선택하세요</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-surface-sunken transition-colors text-text-tertiary"
          >
            <X size={18} />
          </button>
        </div>

        {/* Period list */}
        <div className="p-4 space-y-1 max-h-80 overflow-y-auto">
          {/* 전체 선택 */}
          {issuablePeriods.length > 1 && (
            <label className="flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer hover:bg-surface-sunken">
              <input
                type="checkbox"
                checked={selectedIds.size === issuablePeriods.length}
                ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < issuablePeriods.length }}
                onChange={toggleAll}
                className="accent-brand-600 w-4 h-4"
              />
              <span className="text-sm font-medium text-text-primary">전체 선택</span>
              <span className="ml-auto text-xs text-text-tertiary">{issuablePeriods.length}건</span>
            </label>
          )}

          {periods.length === 0 && (
            <p className="text-sm text-text-tertiary text-center py-8">결제이력이 없습니다.</p>
          )}

          {periods.map(p => {
            const isPaid = p.billing_status === 'paid'
            const isIssued = p.tax_invoice_issued
            const isSelectable = isPaid && !isIssued

            return (
              <label
                key={p.billing_id}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                  isSelectable ? 'cursor-pointer hover:bg-surface-sunken' : 'opacity-50 cursor-default'
                }`}
              >
                {isIssued ? (
                  <CheckCircle2 size={16} className="text-state-success shrink-0" />
                ) : (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(p.billing_id)}
                    disabled={!isSelectable}
                    onChange={() => toggleOne(p.billing_id)}
                    className="accent-brand-600 w-4 h-4 disabled:opacity-40"
                  />
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary">
                    {formatPeriod(p.billing_period, p.billing_type)}
                  </p>
                  <p className="text-[11px] text-text-tertiary">
                    {p.billing_status === 'pending' && '미결제'}
                    {p.billing_status === 'overdue' && '연체'}
                    {p.billing_status === 'paid' && !isIssued && '결제완료 · 미발행'}
                    {p.billing_status === 'paid' && isIssued && `발행완료 ${p.tax_invoice_issued_date ? `(${p.tax_invoice_issued_date.slice(0, 10)})` : ''}`}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-sm tabular-nums font-medium text-text-primary">{fmtKr(p.amount)}원</p>
                  <p className="text-[10px] text-text-tertiary">공급가 {fmtKr(p.supply_amount)}</p>
                </div>
              </label>
            )
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border-subtle">
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 mb-3 px-1">
              <span className="text-xs text-text-secondary">선택 {selectedIds.size}건</span>
              <span className="text-xs text-text-tertiary">·</span>
              <span className="text-sm font-semibold text-text-primary tabular-nums">{fmtKr(selectedTotal)}원</span>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose} className="flex-1">
              취소
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={selectedIds.size === 0 || submitting}
              className="flex-1 text-state-success"
            >
              {submitting ? '처리 중…' : `선택 발행 (${selectedIds.size}건)`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
