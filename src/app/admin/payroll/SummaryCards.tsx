import type { ManagerEntry, WorkerEntry } from './types'
import { computePayslip, type PayslipRates, type TaxType, type SalaryBasis } from '@/lib/payroll/payslipCalc'

export default function SummaryCards({ entries, label, rates }: {
  entries: Array<ManagerEntry | WorkerEntry>
  label: string
  rates: PayslipRates
}) {
  const autoTotal = entries.reduce((s, e) => s + e.auto_amount, 0)
  // 개별 카드의 '지급 합계'와 동일한 공식(payslipCalc.computePayslip)으로 계산.
  // 회사 지출 총액(gross) 합산 — 세후 모드는 gross-up 후 회사가 실제 지출한 금액.
  const finalTotal = entries.reduce((s, e) => {
    if (!e.record) return s + e.auto_amount
    const calc = computePayslip({
      autoAmount: e.auto_amount,
      finalAmount: e.record.final_amount,
      extraItems: e.record.extra_items ?? [],
      extraDeductions: e.record.extra_deductions ?? [],
      taxType: (e.person.tax_type ?? '없음') as TaxType,
      salaryBasis: (e.person.salary_basis ?? '세전') as SalaryBasis,
      rates,
    })
    return s + calc.grossTotal
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
