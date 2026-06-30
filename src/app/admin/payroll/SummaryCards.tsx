import type { PayrollRecord } from './types'

export default function SummaryCards({ entries, label }: {
  entries: Array<{ auto_amount: number; record: PayrollRecord | undefined }>
  label: string
}) {
  const autoTotal = entries.reduce((s, e) => s + e.auto_amount, 0)
  const finalTotal = entries.reduce((s, e) => s + (e.record?.final_amount ?? e.auto_amount), 0)
  const paidCount = entries.filter(e => e.record?.is_paid).length

  return (
    <div className="grid grid-cols-3 gap-3 mb-4">
      <div className="bg-surface rounded-xl border border-border-subtle p-3 text-center">
        <p className="text-xs text-text-tertiary mb-1">{label} 자동합계</p>
        <p className="text-base font-bold text-text-primary">{autoTotal.toLocaleString('ko-KR')}원</p>
      </div>
      <div className="bg-surface rounded-xl border border-brand-200 p-3 text-center">
        <p className="text-xs text-brand-500 mb-1">{label} 최종합계</p>
        <p className="text-base font-bold text-brand-700">{finalTotal.toLocaleString('ko-KR')}원</p>
      </div>
      <div className="bg-surface rounded-xl border border-state-success-bg p-3 text-center">
        <p className="text-xs text-state-success mb-1">지급완료</p>
        <p className="text-base font-bold text-state-success">{paidCount}/{entries.length}명</p>
      </div>
    </div>
  )
}
