'use client'

import { useState, useCallback, useEffect, type ReactElement } from 'react'
import toast from 'react-hot-toast'
import { X, Calculator, Save, CheckCircle, Plus, CreditCard, FileText, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui'
import PayslipInputForm, { type FormState } from './PayslipInputForm'
import PayslipPreviewPane from './PayslipPreviewPane'
import PayslipList, { type PayslipEntry } from './PayslipList'
import PayslipDraftList, { type DraftPayslip } from './PayslipDraftList'
import type { PayrollInput, PayrollResult, EmploymentType } from '@/lib/payroll/types'
import { validatePayslipLegal } from '@/lib/payroll/validator'
import type { LegalIssue } from '@/lib/payroll/validator'
import type { PayrollRecord, ExtraPayItem, TaxType } from './types'
import type { DocumentProps } from '@react-pdf/renderer'
import type { PayslipData } from './PayslipPDF'

// ─── helpers ────────────────────────────────────────────────────────────────

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

function buildInitialForm(month: string, empType: string | null, dayWage: number | null): FormState {
  return {
    employmentType: toEngEmploymentType(empType),
    paymentDate: defaultPayDate(month),
    monthlyBaseSalary: '', hourlyWage: '',
    dailyWage: dayWage ? String(dayWage) : '',
    contractedMonthlyHours: '209', contractedWeeklyHours: '',
    actualMonthlyHours: '', workDays: '', dailyContractedHours: '8',
    overtimeHours: '0', nightHours: '0',
    holidayHoursWithin8: '0', holidayHoursOver8: '0',
    unusedAnnualLeaveDays: '0', otherTaxableAllowance: '0',
    mealAllowance: '0', carAllowance: '0',
    enrolledNationalPension: true, enrolledHealthInsurance: true,
    enrolledEmploymentInsurance: true,
    incomeTax: '0', dependents: '1', otherDeductions: '0',
  }
}

// ─── constants ───────────────────────────────────────────────────────────────

const TAX_TYPES: { value: TaxType; label: string }[] = [
  { value: '4대보험', label: '4대보험 (국민연금·건강·고용·장기요양)' },
  { value: '3대보험', label: '3대보험 (국민연금·건강·장기요양)' },
  { value: '2대보험', label: '2대보험 (건강·장기요양)' },
  { value: '프리랜서3.3%', label: '프리랜서 3.3% (사업소득세)' },
  { value: '없음', label: '없음 (공제 없음)' },
]

const PAY_PRESETS = [
  { label: '식대', amount: 100000 }, { label: '교통비', amount: 100000 },
  { label: '야근수당', amount: 0 }, { label: '주휴수당', amount: 0 },
  { label: '상여금', amount: 0 }, { label: '직책수당', amount: 0 },
]

const DEDUCTION_PRESETS = [
  { label: '손망실', amount: 0 }, { label: '선지급 회수', amount: 0 },
  { label: '가불 회수', amount: 0 }, { label: '지각·조퇴', amount: 0 },
  { label: '결근공제', amount: 0 },
]

// 근로자 4대보험 부담률: 국민연금4.5% + 건강3.545% + 고용0.9%
const INSURANCE_RATE = 0.08945

// ─── ItemEditor ──────────────────────────────────────────────────────────────

function ItemEditor({ items, onChange, variant }: {
  items: ExtraPayItem[]
  onChange: (items: ExtraPayItem[]) => void
  variant: 'pay' | 'deduction'
}) {
  const isDed = variant === 'deduction'
  const presets = isDed ? DEDUCTION_PRESETS : PAY_PRESETS
  const borderCls = isDed
    ? 'border-red-200 bg-red-50/30 focus:ring-red-400'
    : 'border-border focus:ring-brand-500'

  const addPreset = (p: { label: string; amount: number }) => {
    if (items.some(it => it.label === p.label)) {
      toast('이미 추가된 항목입니다.', { icon: '⚠️' }); return
    }
    onChange([...items, { label: p.label, amount: p.amount }])
  }

  const update = (i: number, patch: Partial<ExtraPayItem>) =>
    onChange(items.map((it, idx) => idx === i ? { ...it, ...patch } : it))

  const total = items.reduce((s, it) => s + (it.amount || 0), 0)

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {presets.map(p => (
          <button key={p.label} onClick={() => addPreset(p)}
            className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
              isDed ? 'border-red-200 text-red-700 hover:bg-red-50' : 'border-brand-200 text-brand-700 hover:bg-brand-50'
            }`}
          >
            {isDed ? '−' : '+'} {p.label}{p.amount > 0 ? ` (${(p.amount / 10000).toFixed(0)}만)` : ''}
          </button>
        ))}
        <button onClick={() => onChange([...items, { label: '', amount: 0 }])}
          className="text-[11px] px-2 py-1 rounded-full border border-dashed border-border text-text-tertiary hover:text-text-secondary transition-colors flex items-center gap-0.5"
        >
          <Plus size={10} /> 직접입력
        </button>
      </div>
      {items.map((it, i) => (
        <div key={i} className="flex gap-1.5 mb-1.5 items-center">
          <input type="text" value={it.label} onChange={e => update(i, { label: e.target.value })}
            placeholder="항목명"
            className={`flex-1 px-2 py-1.5 border rounded-lg text-xs focus:outline-none focus:ring-1 ${borderCls}`}
          />
          <input type="number" value={it.amount || ''} onChange={e => update(i, { amount: Number(e.target.value) || 0 })}
            placeholder="금액"
            className={`w-28 px-2 py-1.5 border rounded-lg text-xs focus:outline-none focus:ring-1 ${borderCls}`}
          />
          <button onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            className="text-text-tertiary hover:text-red-500 p-1 shrink-0"
          >
            <X size={13} />
          </button>
        </div>
      ))}
      {total > 0 && (
        <p className={`text-[11px] text-right font-semibold ${isDed ? 'text-red-600' : 'text-orange-600'}`}>
          합계: {isDed ? '−' : '+'}{total.toLocaleString('ko-KR')}원
        </p>
      )}
    </div>
  )
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  workerId: string
  workerName: string
  workerEmploymentType: string | null
  workerDayWage: number | null
  month: string
  personType: 'user' | 'worker'
  personId: string
  phone?: string | null
  accountNumber?: string | null
  taxType: TaxType | null
  salaryBasis: '세전' | '세후' | null
  autoAmount: number
  record?: PayrollRecord
  payslips: PayslipEntry[]
  onClose: () => void
  onUpdated: (record: PayrollRecord) => void
  onPayslipUpdated: (p: PayslipEntry) => void
  onPayslipDeleted: (id: string) => void
  onPublished: () => void
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PayslipDraftModal({
  workerId, workerName, workerEmploymentType, workerDayWage, month,
  personType, personId, phone, accountNumber,
  taxType: initTaxType, salaryBasis: initBasis, autoAmount, record,
  payslips, onClose, onUpdated, onPayslipUpdated, onPayslipDeleted, onPublished,
}: Props) {

  const [tab, setTab] = useState<'settings' | 'payslip' | 'history'>('settings')

  // 설정 탭
  const [finalInput, setFinalInput] = useState(record?.final_amount?.toString() ?? '')
  const [noteInput, setNoteInput] = useState(record?.note ?? '')
  const [extraItems, setExtraItems] = useState<ExtraPayItem[]>(record?.extra_items ?? [])
  const [extraDeductions, setExtraDeductions] = useState<ExtraPayItem[]>(record?.extra_deductions ?? [])
  const [taxType, setTaxType] = useState<TaxType>(initTaxType ?? '없음')
  const [salaryBasis, setSalaryBasis] = useState<'세전' | '세후'>(initBasis ?? '세전')
  const [saving, setSaving] = useState(false)
  const [paying, setPaying] = useState(false)
  const [savingWorker, setSavingWorker] = useState(false)

  // 이력 탭 (레거시 PDF 발행)
  const [payDate, setPayDate] = useState(defaultPayDate(month))
  const [legacyIncomeTax, setLegacyIncomeTax] = useState('0')
  const [publishing, setPublishing] = useState(false)
  const [showLegacyPublish, setShowLegacyPublish] = useState(false)

  // 법정명세서 탭
  const [payslipStep, setPayslipStep] = useState<'input' | 'preview'>('input')
  const [form, setForm] = useState<FormState>(() =>
    buildInitialForm(month, workerEmploymentType, workerDayWage)
  )
  const [result, setResult] = useState<PayrollResult | null>(null)
  const [legalIssues, setLegalIssues] = useState<LegalIssue[] | undefined>(undefined)
  const [calculating, setCalculating] = useState(false)
  const [draftSaving, setDraftSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  // 이력 데이터
  const [draftPayslips, setDraftPayslips] = useState<DraftPayslip[]>([])

  const fetchDraftPayslips = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/payroll/payslips/worker/${workerId}?year_month=${month}`)
      if (!res.ok) return
      const data = await res.json() as { payslips: DraftPayslip[] }
      setDraftPayslips(data.payslips ?? [])
    } catch { /* 무시 */ }
  }, [workerId, month])

  useEffect(() => { void fetchDraftPayslips() }, [fetchDraftPayslips])

  // computed
  const isPaid = record?.is_paid ?? false
  const base = finalInput.trim() !== '' ? Number(finalInput) : autoAmount
  const extraPayTotal = extraItems.reduce((s, it) => s + (it.amount || 0), 0)
  const extraDedTotal = extraDeductions.reduce((s, d) => s + (d.amount || 0), 0)
  const estimated = base + extraPayTotal - extraDedTotal
  const [y, m] = month.split('-')
  const displayMonth = `${y}년 ${Number(m)}월`
  const historyCount = draftPayslips.length + payslips.length

  // ─── 설정 handlers ────────────────────────────────────────────────────────

  const saveWorkerSettings = async (newTax: TaxType, newBasis: '세전' | '세후') => {
    setSavingWorker(true)
    try {
      const res = await fetch('/api/admin/workers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: workerId, tax_type: newTax, salary_basis: newBasis }),
      })
      if (!res.ok) throw new Error('저장 실패')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '세금 설정 저장 실패')
    } finally {
      setSavingWorker(false)
    }
  }

  const handleTaxChange = async (v: TaxType) => {
    setTaxType(v)
    await saveWorkerSettings(v, salaryBasis)
  }

  const handleBasisToggle = async () => {
    const next: '세전' | '세후' = salaryBasis === '세전' ? '세후' : '세전'
    setSalaryBasis(next)
    await saveWorkerSettings(taxType, next)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/payroll', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year_month: month, person_type: personType, person_id: personId,
          auto_amount: autoAmount,
          final_amount: finalInput.trim() === '' ? null : Number(finalInput),
          note: noteInput,
          extra_items: extraItems.filter(it => it.label.trim() !== ''),
          extra_deductions: extraDeductions.filter(d => d.label.trim() !== ''),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onUpdated(data.record)
      toast.success('저장되었습니다.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const handleTogglePaid = async () => {
    setPaying(true)
    try {
      const res = await fetch('/api/admin/payroll', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year_month: month, person_type: personType, person_id: personId,
          auto_amount: autoAmount,
          final_amount: finalInput.trim() === '' ? null : Number(finalInput),
          note: noteInput,
          is_paid: !isPaid,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onUpdated(data.record)
      toast.success(isPaid ? '지급 취소되었습니다.' : '지급 완료 처리되었습니다.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '처리 실패')
    } finally {
      setPaying(false)
    }
  }

  const handlePublish = async () => {
    setPublishing(true)
    try {
      const dataRes = await fetch('/api/admin/payroll/payslip-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, personType, personId, payDate, incomeTax: Number(legacyIncomeTax) || 0 }),
      })
      const dataJson = await dataRes.json()
      if (!dataRes.ok || !dataJson.success) throw new Error(dataJson.error ?? '데이터 조회 실패')
      const payslipData: PayslipData = dataJson.data

      const [{ pdf }, { createElement }, { PayslipPDFDocument }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('react'),
        import('./PayslipPDF'),
      ])
      const elem = createElement(PayslipPDFDocument, { data: payslipData }) as ReactElement<DocumentProps>
      const blob = await pdf(elem).toBlob()
      const fileName = `급여명세서_${workerName}_${month}.pdf`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = fileName; a.click()
      URL.revokeObjectURL(url)

      const saveRes = await fetch('/api/admin/payroll/payslips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year_month: month, person_type: personType, person_id: personId,
          person_name: workerName, pay_date: payDate, file_url: null, file_name: fileName,
          gross_amount: payslipData.gross.finalAmount,
          deduction_amount: payslipData.deductions.total,
          net_amount: payslipData.netPay,
          tax_type: payslipData.person.taxType,
        }),
      })
      if (!saveRes.ok) throw new Error('이력 저장 실패')
      toast.success('명세서 발행 완료')
      onPublished()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '발행 실패')
    } finally {
      setPublishing(false)
    }
  }

  // ─── 법정명세서 handlers ──────────────────────────────────────────────────

  const handleChange = useCallback((patch: Partial<FormState>) => {
    setForm(prev => ({ ...prev, ...patch }))
    setResult(null)
    setLegalIssues(undefined)
    setSavedId(null)
  }, [])

  // 설정 탭 값 → 법정명세서 탭 자동 동기화
  const syncFromSettings = useCallback(() => {
    const baseAmt = finalInput.trim() !== '' ? Number(finalInput) : autoAmount
    const mealAmt = extraItems.find(it => it.label.includes('식대'))?.amount ?? 0
    const carAmt = extraItems.find(it => it.label.includes('교통비'))?.amount ?? 0
    const otherPayAmt = extraItems
      .filter(it => !it.label.includes('식대') && !it.label.includes('교통비'))
      .reduce((s, it) => s + (it.amount || 0), 0)
    const otherDedAmt = extraDeductions.reduce((s, d) => s + (d.amount || 0), 0)

    // 식대·교통비는 비과세 — gross-up 대상 아님
    const taxableAmt = baseAmt + otherPayAmt
    const grossTaxable = salaryBasis === '세후'
      ? Math.round(taxableAmt / (1 - INSURANCE_RATE))
      : taxableAmt

    setForm(prev => ({
      ...prev,
      monthlyBaseSalary: grossTaxable > 0 ? String(grossTaxable) : '',
      mealAllowance: mealAmt > 0 ? String(mealAmt) : '0',
      carAllowance: carAmt > 0 ? String(carAmt) : '0',
      otherTaxableAllowance: '0',
      otherDeductions: String(otherDedAmt),
    }))
    setResult(null)
    setLegalIssues(undefined)
    setSavedId(null)
    setPayslipStep('input')
  }, [finalInput, autoAmount, extraItems, extraDeductions, salaryBasis])

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
        const input2 = buildPayrollInput(form, month)
        setResult(data.data)
        setLegalIssues(validatePayslipLegal(workerName, input2, data.data).issues)
        setPayslipStep('preview')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '계산 실패')
    } finally {
      setCalculating(false)
    }
  }

  const handleDraft = async () => {
    if (!result) return
    setDraftSaving(true)
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
      void fetchDraftPayslips()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setDraftSaving(false)
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
      void fetchDraftPayslips()
      setSavedId(null)
      setResult(null)
      setLegalIssues(undefined)
      setPayslipStep('input')
      setTab('history')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '확정 실패')
    } finally {
      setConfirming(false)
    }
  }

  // ─── JSX ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-surface w-full sm:max-w-lg sm:mx-4 rounded-t-2xl sm:rounded-2xl shadow-modal flex flex-col max-h-[90vh]">

        {/* 헤더 */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-text-primary leading-tight">{workerName}</h2>
            <p className="text-[11px] text-text-tertiary">{displayMonth} 급여 관리</p>
          </div>
          <div className="flex items-center gap-1.5">
            {isPaid && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-state-success-bg text-state-success font-semibold flex items-center gap-0.5">
                <CreditCard size={10} />지급완료
              </span>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-sunken shrink-0">
              <X size={16} className="text-text-secondary" />
            </button>
          </div>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-border-subtle shrink-0">
          {([
            { key: 'settings' as const, label: '급여설정' },
            { key: 'payslip' as const, label: '법정명세서' },
            { key: 'history' as const, label: historyCount > 0 ? `발행이력 (${historyCount})` : '발행이력' },
          ]).map(t => (
            <button
              key={t.key}
              onClick={() => {
                if (t.key === 'payslip' && tab !== 'payslip' && result === null) {
                  syncFromSettings()
                }
                setTab(t.key)
              }}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                tab === t.key ? 'text-brand-600 border-b-2 border-brand-600' : 'text-text-secondary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 콘텐츠 */}
        <div className="flex-1 overflow-y-auto overscroll-contain">

          {/* ── 급여설정 탭 ── */}
          {tab === 'settings' && (
            <div className="p-4 space-y-4">
              {(phone || accountNumber) && (
                <div className="flex gap-3 text-xs text-text-secondary">
                  {phone && <span>📞 {phone}</span>}
                  {accountNumber && <span className="font-mono">🏦 {accountNumber}</span>}
                </div>
              )}

              <div className="bg-surface-sunken rounded-xl p-3 space-y-2.5">
                <p className="text-xs font-semibold text-text-secondary">세금 설정</p>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-text-tertiary w-14 shrink-0">급여 기준</span>
                  <button
                    onClick={handleBasisToggle}
                    disabled={savingWorker}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors disabled:cursor-not-allowed ${
                      salaryBasis === '세후'
                        ? 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100'
                        : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    {savingWorker ? '...' : salaryBasis} ↕
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-text-tertiary w-14 shrink-0">세금 유형</span>
                  <select
                    value={taxType}
                    onChange={e => handleTaxChange(e.target.value as TaxType)}
                    disabled={savingWorker}
                    className="flex-1 px-2 py-1.5 border border-border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-surface disabled:cursor-not-allowed"
                  >
                    {TAX_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-text-secondary">급여 조정</p>
                <input
                  type="number"
                  value={finalInput}
                  onChange={e => setFinalInput(e.target.value)}
                  placeholder={`최종 지급액 (자동: ${autoAmount.toLocaleString('ko-KR')}원)`}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <input
                  type="text"
                  value={noteInput}
                  onChange={e => setNoteInput(e.target.value)}
                  placeholder="메모"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <p className="text-xs font-semibold text-text-secondary mb-2">추가 지급 항목</p>
                <ItemEditor items={extraItems} onChange={setExtraItems} variant="pay" />
              </div>

              <div>
                <p className="text-xs font-semibold text-red-700 mb-2">추가 공제 항목</p>
                <ItemEditor items={extraDeductions} onChange={setExtraDeductions} variant="deduction" />
              </div>

              <div className="bg-surface-sunken rounded-xl p-3 text-xs space-y-1.5">
                <p className="font-semibold text-text-secondary">급여 요약</p>
                <div className="flex justify-between">
                  <span className="text-text-tertiary">{finalInput ? '조정 지급액' : '자동 계산액'}</span>
                  <span className="font-medium">{(finalInput ? Number(finalInput) : autoAmount).toLocaleString('ko-KR')}원</span>
                </div>
                {extraPayTotal > 0 && (
                  <div className="flex justify-between text-orange-600">
                    <span>추가 지급 합계</span>
                    <span>+{extraPayTotal.toLocaleString('ko-KR')}원</span>
                  </div>
                )}
                {extraDedTotal > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>추가 공제 합계</span>
                    <span>−{extraDedTotal.toLocaleString('ko-KR')}원</span>
                  </div>
                )}
                <div className="border-t border-border-subtle pt-1.5 flex justify-between font-bold text-text-primary">
                  <span>예상 실지급액</span>
                  <span>{estimated.toLocaleString('ko-KR')}원</span>
                </div>
                <p className="text-[10px] text-text-tertiary">※ {taxType} 공제는 PDF 명세서에서 정확히 계산됩니다.</p>
              </div>
            </div>
          )}

          {/* ── 법정명세서 탭 ── */}
          {tab === 'payslip' && (
            <div>
              <div className="px-4 pt-3 pb-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[11px] text-text-tertiary">
                  <span className={payslipStep === 'input' ? 'text-brand-600 font-semibold' : ''}>① 입력</span>
                  <span>→</span>
                  <span className={payslipStep === 'preview' ? 'text-brand-600 font-semibold' : ''}>② 계산 결과</span>
                  {savedId && <><span>→</span><span className="text-emerald-600 font-semibold">③ 확정 대기</span></>}
                </div>
                <button
                  onClick={syncFromSettings}
                  className="flex items-center gap-0.5 text-[11px] text-brand-600 hover:text-brand-700 shrink-0"
                >
                  <RefreshCw size={10} />급여설정 반영
                </button>
              </div>
              {payslipStep === 'input' && <PayslipInputForm form={form} onChange={handleChange} />}
              {payslipStep === 'preview' && result && (
                <PayslipPreviewPane result={result} legalIssues={legalIssues} />
              )}
            </div>
          )}

          {/* ── 발행이력 탭 ── */}
          {tab === 'history' && (
            <div className="p-4 space-y-4">
              <section>
                <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">법정 명세서 (신규)</h3>
                {draftPayslips.length > 0 ? (
                  <PayslipDraftList payslips={draftPayslips} onRefresh={fetchDraftPayslips} />
                ) : (
                  <p className="text-xs text-text-tertiary text-center py-3">발행된 법정 명세서가 없습니다.</p>
                )}
              </section>

              {payslips.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">PDF 명세서 (구)</h3>
                  <PayslipList payslips={payslips} onUpdated={onPayslipUpdated} onDeleted={onPayslipDeleted} />
                </section>
              )}

              <div className="border-t border-dashed border-border-subtle pt-3">
                <button
                  onClick={() => setShowLegacyPublish(v => !v)}
                  className="w-full flex items-center justify-between text-xs font-semibold text-text-secondary"
                >
                  <span className="flex items-center gap-1.5">
                    <FileText size={13} className="text-brand-600" />PDF 명세서 발행 (구 방식)
                  </span>
                  {showLegacyPublish ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                {showLegacyPublish && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="text-xs font-medium text-text-secondary block mb-1">지급일</label>
                      <input
                        type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                        disabled={publishing}
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-surface-sunken"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-text-secondary block mb-1">소득세</label>
                      <input
                        type="number" value={legacyIncomeTax} onChange={e => setLegacyIncomeTax(e.target.value)}
                        placeholder="0" disabled={publishing}
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-surface-sunken"
                      />
                      <p className="text-[11px] text-text-tertiary mt-1">※ 프리랜서3.3%는 자동 계산됩니다.</p>
                    </div>
                    <button
                      onClick={handlePublish} disabled={publishing}
                      className="w-full py-2.5 text-sm font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-1.5"
                    >
                      <FileText size={14} />
                      {publishing ? '발행 중...' : 'PDF 명세서 발행'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 푸터 — 설정/법정명세서 탭만 */}
        {tab !== 'history' && (
          <div className="border-t border-border-subtle px-4 py-3 shrink-0 flex gap-2">
            {tab === 'settings' && (
              <>
                <Button onClick={handleSave} disabled={saving} className="flex-1">
                  {saving ? '저장 중...' : '저장'}
                </Button>
                <Button
                  onClick={handleTogglePaid}
                  disabled={paying}
                  className={`flex-1 ${isPaid ? 'bg-gray-400 hover:bg-gray-500' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                >
                  {paying ? '처리 중...' : isPaid ? '지급 취소' : '지급완료'}
                </Button>
                <Button
                  onClick={() => {
                    if (result === null) syncFromSettings()
                    setTab('payslip')
                  }}
                  className="flex-1 flex items-center justify-center gap-1 bg-indigo-600 hover:bg-indigo-700"
                >
                  <FileText size={13} />법정명세서
                </Button>
              </>
            )}
            {tab === 'payslip' && payslipStep === 'input' && (
              <Button onClick={handleCalculate} disabled={calculating}
                className="flex-1 flex items-center justify-center gap-1.5"
              >
                <Calculator size={15} />
                {calculating ? '계산 중...' : '계산하기'}
              </Button>
            )}
            {tab === 'payslip' && payslipStep === 'preview' && !savedId && (
              <>
                <Button variant="secondary" onClick={() => setPayslipStep('input')} className="flex-1">수정</Button>
                <Button onClick={handleDraft} disabled={draftSaving}
                  className="flex-1 flex items-center justify-center gap-1.5"
                >
                  <Save size={15} />
                  {draftSaving ? '저장 중...' : 'DRAFT 저장'}
                </Button>
              </>
            )}
            {tab === 'payslip' && payslipStep === 'preview' && savedId && (
              <Button onClick={handleConfirm} disabled={confirming}
                className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700"
              >
                <CheckCircle size={15} />
                {confirming ? '확정 중...' : '확정 (CONFIRMED)'}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
