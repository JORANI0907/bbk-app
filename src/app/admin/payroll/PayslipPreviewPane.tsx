'use client'

import type { PayrollResult } from '@/lib/payroll/types'
import type { LegalIssue } from '@/lib/payroll/validator'
import { ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react'
import { useState } from 'react'

const fmt = (n: number) => n.toLocaleString('ko-KR')

const ITEM_LABELS: Record<number, string> = {
  1: '①근로자 식별정보',
  2: '②임금 지급일',
  3: '③임금 총액',
  4: '④구성항목별 금액',
  5: '⑤구성항목별 계산방법',
  6: '⑥공제항목별 금액과 합계',
}

interface Props {
  result: PayrollResult
  legalIssues?: LegalIssue[]
}

export default function PayslipPreviewPane({ result, legalIssues }: Props) {
  const [showEmployer, setShowEmployer] = useState(false)
  const hasLegalCheck = legalIssues !== undefined
  const isLegalValid = hasLegalCheck && legalIssues.length === 0

  return (
    <div className="p-4 space-y-4">
      {/* 법정 필수기재사항 검증 (§48②) */}
      {hasLegalCheck && (
        <div className={`rounded-xl border p-3 ${isLegalValid ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
          <div className="flex items-center gap-1.5 mb-1.5">
            {isLegalValid
              ? <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
              : <ShieldAlert size={14} className="text-red-600 shrink-0" />
            }
            <span className={`text-xs font-semibold ${isLegalValid ? 'text-emerald-700' : 'text-red-700'}`}>
              근로기준법 §48② 법정 필수기재사항
            </span>
          </div>
          {isLegalValid ? (
            <p className="text-xs text-emerald-700">6가지 항목 모두 충족 ✓</p>
          ) : (
            <ul className="space-y-0.5">
              {legalIssues.map((issue, i) => (
                <li key={i} className="text-xs text-red-700 flex items-start gap-1">
                  <span className="shrink-0 font-medium">{ITEM_LABELS[issue.item] ?? `${issue.item}호`}</span>
                  <span className="text-red-600">— {issue.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 계산 엔진 경고 */}
      {result.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1">
          {result.warnings.map((w, i) => (
            <p key={i} className="flex items-start gap-1.5 text-xs text-amber-800">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              {w}
            </p>
          ))}
        </div>
      )}

      {/* 지급 항목 */}
      <section>
        <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">지급 항목</h3>
        <div className="rounded-xl border border-border-subtle overflow-hidden">
          <div className="divide-y divide-border-subtle">
            {result.payItems.map(item => (
              <div key={item.key} className="flex items-center px-3 py-2 gap-2">
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-text-primary">{item.label}</span>
                  {!item.taxable && (
                    <span className="ml-1.5 text-[10px] px-1 py-0.5 bg-emerald-50 text-emerald-700 rounded">비과세</span>
                  )}
                  <p className="text-[10px] text-text-tertiary mt-0.5 leading-tight">{item.calcMethod}</p>
                </div>
                <span className="text-sm font-semibold text-text-primary shrink-0">{fmt(item.amount)}원</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between px-3 py-2 bg-surface-sunken border-t border-border">
            <span className="text-xs font-semibold text-text-secondary">총 지급액</span>
            <span className="text-sm font-bold text-text-primary">{fmt(result.grossPay)}원</span>
          </div>
        </div>
      </section>

      {/* 공제 항목 */}
      <section>
        <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">공제 항목</h3>
        <div className="rounded-xl border border-border-subtle overflow-hidden">
          <div className="divide-y divide-border-subtle">
            {result.deductItems.map(item => (
              <div key={item.key} className="flex items-center px-3 py-2 gap-2">
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-text-primary">{item.label}</span>
                  <p className="text-[10px] text-text-tertiary mt-0.5 leading-tight">{item.calcMethod}</p>
                </div>
                <span className="text-sm font-semibold text-state-danger shrink-0">-{fmt(item.amount)}원</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between px-3 py-2 bg-surface-sunken border-t border-border">
            <span className="text-xs font-semibold text-text-secondary">공제 합계</span>
            <span className="text-sm font-bold text-state-danger">-{fmt(result.totalDeduction)}원</span>
          </div>
        </div>
      </section>

      {/* 실지급액 */}
      <div className="rounded-2xl bg-brand-600 px-4 py-3 flex items-center justify-between">
        <span className="text-white font-semibold text-sm">실지급액</span>
        <span className="text-white font-bold text-xl">{fmt(result.netPay)}원</span>
      </div>

      {/* 사업주 부담 (토글) */}
      <section>
        <button
          onClick={() => setShowEmployer(v => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary"
        >
          {showEmployer ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          사업주 부담비용
        </button>
        {showEmployer && (
          <div className="mt-2 rounded-xl border border-border-subtle overflow-hidden">
            {[
              { label: '국민연금 (사용자)', value: result.employerCost.nationalPension },
              { label: '건강보험 (사용자)', value: result.employerCost.healthInsurance },
              { label: '장기요양 (사용자)', value: result.employerCost.ltcInsurance },
              { label: '고용보험 (사용자)', value: result.employerCost.employmentInsurance },
              { label: '고용안정·직능개발', value: result.employerCost.employmentStability },
              { label: '산재보험', value: result.employerCost.industrialAccident },
              { label: '임금채권보장기금', value: result.employerCost.wageClaimGuarantee },
              { label: '퇴직급여 적립', value: result.employerCost.severanceAccrual },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between px-3 py-1.5 border-b border-border-subtle last:border-b-0">
                <span className="text-xs text-text-secondary">{label}</span>
                <span className="text-xs font-medium text-text-primary">{fmt(value)}원</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-2 bg-surface-sunken border-t border-border">
              <span className="text-xs font-semibold text-text-secondary">총 사업주 부담</span>
              <span className="text-xs font-bold text-text-primary">{fmt(result.employerCost.total)}원</span>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
