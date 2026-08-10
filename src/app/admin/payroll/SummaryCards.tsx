import type { PayrollRecord } from './types'

export default function SummaryCards({ entries, label }: {
  entries: Array<{ auto_amount: number; record: PayrollRecord | undefined }>
  label: string
}) {
  const autoTotal = entries.reduce((s, e) => s + e.auto_amount, 0)
  // 개별 카드의 '실지급 예상'과 동일한 공식으로 계산:
  //   base(final_amount ?? auto_amount) + extra_items - extra_deductions
  // 이전에는 base만 합산해 추가 지급/공제가 누락됐음.
  const finalTotal = entries.reduce((s, e) => {
    const base = e.record?.final_amount ?? e.auto_amount
    const extras = (e.record?.extra_items ?? []).reduce((a, it) => a + (it.amount || 0), 0)
    const deducts = (e.record?.extra_deductions ?? []).reduce((a, it) => a + (it.amount || 0), 0)
    return s + base + extras - deducts
  }, 0)
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
