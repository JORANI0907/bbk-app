'use client'

import { useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { X, Calculator, Save, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui'
import PayslipInputForm, { type FormState } from './PayslipInputForm'
import PayslipPreviewPane from './PayslipPreviewPane'
import type { PayrollInput, PayrollResult, EmploymentType } from '@/lib/payroll/types'
import { validatePayslipLegal } from '@/lib/payroll/validator'
import type { LegalIssue } from '@/lib/payroll/validator'

function defaultPayDate(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const next = new Date(y, m, 10)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
}

function toEngEmploymentType(kor: string | null): EmploymentType {
  if (!kor) return 'DAILY'
  if (kor.includes('정규') || kor.includes('정직')) return 'FULL_TIME'
  if (kor.includes('계약')) return 'CONTRACT'
  if (kor.includes('초단')) return 'ULTRA_SHORT'
  if (kor.includes('단시간') || kor.includes('파트') || kor.includes('알바')) return 'PART_TIME'
  if (kor.includes('프리랜서') || kor.includes('3.3')) return 'FREELANCER'
  if (kor.includes('도급') || kor.includes('외주')) return 'SUBCONTRACT'
  if (kor.includes('일용') || kor.includes('일당')) return 'DAILY'
  return 'DAILY'
}

function buildPayrollInput(form: FormState, month: string): PayrollInput {
  const [year, month_] = month.split('-').map(Number)
  const n = (s: string, fallback = 0) => Number(s) || fallback
  return {
    employmentType: form.employmentType,
    payPeriod: { year, month: month_ },
    paymentDate: form.paymentDate,
    monthlyBaseSalary: n(form.monthlyBaseSalary) || undefined,
    hourlyWage: n(form.hourlyWage) || undefined,
    dailyWage: n(form.dailyWage) || undefined,
    contractedMonthlyHours: n(form.contractedMonthlyHours) || undefined,
    contractedWeeklyHours: n(form.contractedWeeklyHours) || undefined,
    actualMonthlyHours: n(form.actualMonthlyHours) || undefined,
    workDays: n(form.workDays) || undefined,
    dailyContractedHours: n(form.dailyContractedHours) || undefined,
    overtimeHours: n(form.overtimeHours),
    nightHours: n(form.nightHours),
    holidayHoursWithin8: n(form.holidayHoursWithin8),
    holidayHoursOver8: n(form.holidayHoursOver8),
    unusedAnnualLeaveDays: n(form.unusedAnnualLeaveDays),
    otherTaxableAllowance: n(form.otherTaxableAllowance),
    mealAllowance: n(form.mealAllowance),
    carAllowance: n(form.carAllowance),
    enrolledNationalPension: form.enrolledNationalPension,
    enrolledHealthInsurance: form.enrolledHealthInsurance,
    enrolledEmploymentInsurance: form.enrolledEmploymentInsurance,
    incomeTax: n(form.incomeTax),
    dependents: n(form.dependents, 1),
    otherDeductions: n(form.otherDeductions),
  }
}

function buildInitialForm(month: string, workerEmploymentType: string | null, dayWage: number | null): FormState {
  return {
    employmentType: toEngEmploymentType(workerEmploymentType),
    paymentDate: defaultPayDate(month),
    monthlyBaseSalary: '',
    hourlyWage: '',
    dailyWage: dayWage ? String(dayWage) : '',
    contractedMonthlyHours: '209',
    contractedWeeklyHours: '',
    actualMonthlyHours: '',
    workDays: '',
    dailyContractedHours: '8',
    overtimeHours: '0',
    nightHours: '0',
    holidayHoursWithin8: '0',
    holidayHoursOver8: '0',
    unusedAnnualLeaveDays: '0',
    otherTaxableAllowance: '0',
    mealAllowance: '0',
    carAllowance: '0',
    enrolledNationalPension: true,
    enrolledHealthInsurance: true,
    enrolledEmploymentInsurance: true,
    incomeTax: '0',
    dependents: '1',
    otherDeductions: '0',
  }
}

interface Props {
  workerId: string
  workerName: string
  workerEmploymentType: string | null
  workerDayWage: number | null
  month: string
  onClose: () => void
  onSaved: () => void
}

export default function PayslipDraftModal({
  workerId, workerName, workerEmploymentType, workerDayWage, month, onClose, onSaved,
}: Props) {
  const [tab, setTab] = useState<'form' | 'preview'>('form')
  const [form, setForm] = useState<FormState>(() =>
    buildInitialForm(month, workerEmploymentType, workerDayWage)
  )
  const [result, setResult] = useState<PayrollResult | null>(null)
  const [legalIssues, setLegalIssues] = useState<LegalIssue[] | undefined>(undefined)
  const [calculating, setCalculating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const handleChange = useCallback((patch: Partial<FormState>) => {
    setForm(prev => ({ ...prev, ...patch }))
    setResult(null)
    setLegalIssues(undefined)
    setSavedId(null)
  }, [])

  const handleCalculate = async () => {
    setCalculating(true)
    try {
      const input = buildPayrollInput(form, month)
      const res = await fetch('/api/admin/payroll/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, workerId }),
      })
      const data = await res.json() as { data?: PayrollResult; error?: string }
      if (!res.ok) throw new Error(data.error ?? '계산 실패')
      if (data.data?.warnings?.length) {
        data.data.warnings.forEach((w: string) => toast(w, { icon: '⚠️' }))
      }
      if (data.data) {
        setResult(data.data)
        const validation = validatePayslipLegal(workerName, input, data.data)
        setLegalIssues(validation.issues)
        setTab('preview')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '계산 실패')
    } finally {
      setCalculating(false)
    }
  }

  const handleDraft = async () => {
    if (!result) return
    setSaving(true)
    try {
      const input = buildPayrollInput(form, month)
      const res = await fetch('/api/admin/payroll/payslips/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workerId, input }),
      })
      const data = await res.json() as { payslip?: { id: string }; error?: string }
      if (!res.ok) throw new Error(data.error ?? '저장 실패')
      if (data.payslip) setSavedId(data.payslip.id)
      toast.success('DRAFT 명세서가 저장되었습니다.')
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const handleConfirm = async () => {
    if (!savedId) return
    setConfirming(true)
    try {
      const res = await fetch(`/api/admin/payroll/payslips/${savedId}/confirm`, { method: 'PATCH' })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? '확정 실패')
      toast.success('명세서가 확정되었습니다.')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '확정 실패')
    } finally {
      setConfirming(false)
    }
  }

  const [y, m] = month.split('-')
  const displayMonth = `${y}년 ${Number(m)}월`

  return (
    /* 백드롭 */
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* 모달 패널 — 모바일: 하단 시트, sm+: 중앙 모달 */}
      <div className="bg-surface w-full sm:max-w-lg sm:mx-4 rounded-t-2xl sm:rounded-2xl shadow-modal flex flex-col max-h-[90vh]">

        {/* 헤더 */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-text-primary leading-tight">{workerName}</h2>
            <p className="text-[11px] text-text-tertiary">{displayMonth} 법정 급여명세서</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-sunken shrink-0">
            <X size={16} className="text-text-secondary" />
          </button>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-border-subtle shrink-0">
          {(['form', 'preview'] as const).map(t => (
            <button
              key={t}
              onClick={() => { if (t === 'preview' && !result) return; setTab(t) }}
              disabled={t === 'preview' && !result}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                tab === t ? 'text-brand-600 border-b-2 border-brand-600' : 'text-text-secondary disabled:opacity-40'
              }`}
            >
              {t === 'form' ? '입력' : '미리보기'}
            </button>
          ))}
        </div>

        {/* 콘텐츠 (스크롤) */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {tab === 'form' && (
            <PayslipInputForm form={form} onChange={handleChange} />
          )}
          {tab === 'preview' && result && (
            <PayslipPreviewPane result={result} legalIssues={legalIssues} />
          )}
        </div>

        {/* 푸터 액션 */}
        <div className="border-t border-border-subtle px-4 py-3 shrink-0 flex gap-2">
          {tab === 'form' && (
            <Button
              onClick={handleCalculate}
              disabled={calculating}
              className="flex-1 flex items-center justify-center gap-1.5"
            >
              <Calculator size={15} />
              {calculating ? '계산 중...' : '계산하기'}
            </Button>
          )}
          {tab === 'preview' && !savedId && (
            <>
              <Button variant="secondary" onClick={() => setTab('form')} className="flex-1">
                수정
              </Button>
              <Button onClick={handleDraft} disabled={saving} className="flex-1 flex items-center justify-center gap-1.5">
                <Save size={15} />
                {saving ? '저장 중...' : 'DRAFT 저장'}
              </Button>
            </>
          )}
          {tab === 'preview' && savedId && (
            <Button
              onClick={handleConfirm}
              disabled={confirming}
              className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            >
              <CheckCircle size={15} />
              {confirming ? '확정 중...' : '확정 (CONFIRMED)'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
