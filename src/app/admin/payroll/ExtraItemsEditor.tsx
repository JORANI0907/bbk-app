'use client'

import { Plus, X } from 'lucide-react'
import type { ExtraPayItem } from './types'

export default function ExtraItemsEditor({
  items,
  onChange,
  title = '추가 지급 항목',
  hint = '식대, 교통비 등 추가 항목을 입력하면 PDF 지급내역에 표시됩니다.',
  variant = 'pay',
}: {
  items: ExtraPayItem[]
  onChange: (items: ExtraPayItem[]) => void
  title?: string
  hint?: string
  variant?: 'pay' | 'deduction'
}) {
  const addItem = () => onChange([...items, { label: '', amount: 0 }])
  const removeItem = (i: number) => onChange(items.filter((_, idx) => idx !== i))
  const updateLabel = (i: number, label: string) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, label } : it)))
  const updateAmount = (i: number, raw: string) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, amount: Number(raw) || 0 } : it)))

  const isDeduction = variant === 'deduction'

  return (
    <div className={`border rounded-md p-2 mb-2 ${isDeduction ? 'border-red-200 bg-red-50/20' : 'border-dashed border-border'}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-[11px] font-semibold ${isDeduction ? 'text-red-700' : 'text-text-secondary'}`}>{title}</span>
        <button
          type="button"
          onClick={addItem}
          className="text-[11px] text-brand-600 hover:text-brand-700 flex items-center gap-0.5 font-medium"
        >
          <Plus size={11} />
          항목 추가
        </button>
      </div>

      {items.length === 0 && (
        <p className="text-[10px] text-text-tertiary text-center py-1">{hint}</p>
      )}

      {items.map((item, i) => (
        <div key={i} className="flex gap-1 mb-1 items-center">
          <input
            type="text"
            value={item.label}
            onChange={e => updateLabel(i, e.target.value)}
            placeholder="항목명"
            className="flex-1 min-w-0 px-2 py-1 border border-border rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <input
            type="number"
            value={item.amount || ''}
            onChange={e => updateAmount(i, e.target.value)}
            placeholder="금액"
            className="w-24 px-2 py-1 border border-border rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <button
            type="button"
            onClick={() => removeItem(i)}
            className="text-text-tertiary hover:text-state-danger p-0.5 shrink-0"
          >
            <X size={13} />
          </button>
        </div>
      ))}

      {items.length > 0 && (
        <div className="flex justify-end mt-1.5 pt-1.5 border-t border-border-subtle">
          <span className="text-[10px] text-text-tertiary">
            합계:{' '}
            <span className={`font-semibold ${isDeduction ? 'text-red-600' : 'text-orange-600'}`}>
              {items.reduce((s, it) => s + (it.amount || 0), 0).toLocaleString('ko-KR')}원
            </span>
          </span>
        </div>
      )}
    </div>
  )
}
