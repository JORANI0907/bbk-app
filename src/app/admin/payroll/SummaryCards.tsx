import type { PayrollRecord } from './types'

export default function SummaryCards({ entries, label }: {
  entries: Array<{ auto_amount: number; record: PayrollRecord | undefined }>
  label: string
}) {
  const autoTotal = entries.reduce((s, e) => s + e.auto_amount, 0)
  const finalTotal = entries.reduce((s, e) => s + (e.record?.final_amount ?? e.auto_amount), 0)
  const paidCount = entries.filter(e => e.record?.is_paid).length

  return (
    <div className="grid grid-cols-3 gap-2 mb-3">
      <div className="bg-surface rounded-lg border border-border-subtle px-2 py-1.5 text-center">
        <p className="text-[10px] text-text-tertiary leading-tight">{label} 자동</p>
        <p className="text-sm font-bold text-text-primary leading-tight">{autoTotal.toLocaleString('ko-KR')}</p>
      </div>
      <div className="bg-surface rounded-lg border border-brand-200 px-2 py-1.5 text-center">
        <p className="text-[10px] text-brand-500 leading-tight">{label} 최종</p>
        <p className="text-sm font-bold text-brand-700 leading-tight">{finalTotal.toLocaleString('ko-KR')}</p>
      </div>
      <div className="bg-surface rounded-lg border border-state-success-bg px-2 py-1.5 text-center">
        <p className="text-[10px] text-state-success leading-tight">지급완료</p>
        <p className="text-sm font-bold text-state-success leading-tight">{paidCount}/{entries.length}명</p>
      </div>
    </div>
  )
}
