'use client'

import { useState, type ReactElement } from 'react'
import toast from 'react-hot-toast'
import { X, CreditCard, FileText, Plus, ChevronDown, ChevronUp } from 'lucide-react'
import type { PayrollRecord, ExtraPayItem, TaxType } from './types'
import type { PayslipEntry } from './PayslipList'
import PayslipList from './PayslipList'
import type { DocumentProps } from '@react-pdf/renderer'
import type { PayslipData } from './PayslipPDF'

function defaultPayDate(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const next = new Date(y, m, 10)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
}

const TAX_TYPES: { value: TaxType; label: string }[] = [
  { value: '4대보험', label: '4대보험 (국민연금·건강·고용·장기요양)' },
  { value: '3대보험', label: '3대보험 (국민연금·건강·장기요양)' },
  { value: '2대보험', label: '2대보험 (건강·장기요양)' },
  { value: '프리랜서3.3%', label: '프리랜서 3.3% (사업소득세)' },
  { value: '없음', label: '없음 (공제 없음)' },
]

const PAY_PRESETS = [
  { label: '식대', amount: 100000 },
  { label: '교통비', amount: 100000 },
  { label: '야근수당', amount: 0 },
  { label: '주휴수당', amount: 0 },
  { label: '상여금', amount: 0 },
  { label: '직책수당', amount: 0 },
  { label: '명절수당', amount: 0 },
  { label: '연장근로수당', amount: 0 },
]

const DEDUCTION_PRESETS = [
  { label: '손망실', amount: 0 },
  { label: '선지급 회수', amount: 0 },
  { label: '가불 회수', amount: 0 },
  { label: '지각·조퇴', amount: 0 },
  { label: '결근공제', amount: 0 },
]

interface Props {
  personType: 'user' | 'worker'
  personId: string
  personName: string
  workerDbId?: string | null
  phone?: string | null
  accountNumber?: string | null
  taxType: TaxType | null
  salaryBasis: '세전' | '세후' | null
  autoAmount: number
  record?: PayrollRecord
  month: string
  displayMonth: string
  payslips: PayslipEntry[]
  onClose: () => void
  onUpdated: (record: PayrollRecord) => void
  onPayslipUpdated: (p: PayslipEntry) => void
  onPayslipDeleted: (id: string) => void
  onPublished: () => void
}

function ItemEditor({
  items, onChange, variant,
}: {
  items: ExtraPayItem[]
  onChange: (items: ExtraPayItem[]) => void
  variant: 'pay' | 'deduction'
}) {
  const isDed = variant === 'deduction'
  const presets = isDed ? DEDUCTION_PRESETS : PAY_PRESETS
  const borderCls = isDed ? 'border-red-200 bg-red-50/30 focus:ring-red-400' : 'border-border focus:ring-brand-500'

  const addPreset = (preset: { label: string; amount: number }) => {
    if (items.some(it => it.label === preset.label)) {
      toast('이미 추가된 항목입니다.', { icon: '⚠️' }); return
    }
    onChange([...items, { label: preset.label, amount: preset.amount }])
  }

  const update = (i: number, patch: Partial<ExtraPayItem>) =>
    onChange(items.map((it, idx) => idx === i ? { ...it, ...patch } : it))

  const total = items.reduce((s, it) => s + (it.amount || 0), 0)

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {presets.map(p => (
          <button
            key={p.label}
            onClick={() => addPreset(p)}
            className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
              isDed
                ? 'border-red-200 text-red-700 hover:bg-red-50'
                : 'border-brand-200 text-brand-700 hover:bg-brand-50'
            }`}
          >
            {isDed ? '−' : '+'} {p.label}{p.amount > 0 ? ` (${(p.amount / 10000).toFixed(0)}만)` : ''}
          </button>
        ))}
        <button
          onClick={() => onChange([...items, { label: '', amount: 0 }])}
          className="text-[11px] px-2 py-1 rounded-full border border-dashed border-border text-text-tertiary hover:text-text-secondary transition-colors flex items-center gap-0.5"
        >
          <Plus size={10} /> 직접입력
        </button>
      </div>
      {items.map((it, i) => (
        <div key={i} className="flex gap-1.5 mb-1.5 items-center">
          <input
            type="text"
            value={it.label}
            onChange={e => update(i, { label: e.target.value })}
            placeholder="항목명"
            className={`flex-1 px-2 py-1.5 border rounded-lg text-xs focus:outline-none focus:ring-1 ${borderCls}`}
          />
          <input
            type="number"
            value={it.amount || ''}
            onChange={e => update(i, { amount: Number(e.target.value) || 0 })}
            placeholder="금액"
            className={`w-28 px-2 py-1.5 border rounded-lg text-xs focus:outline-none focus:ring-1 ${borderCls}`}
          />
          <button onClick={() => onChange(items.filter((_, idx) => idx !== i))} className="text-text-tertiary hover:text-red-500 p-1 shrink-0">
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

export default function PayrollDetailModal({
  personType, personId, personName, workerDbId, phone, accountNumber,
  taxType: initTaxType, salaryBasis: initBasis, autoAmount, record,
  month, displayMonth, payslips, onClose, onUpdated, onPayslipUpdated, onPayslipDeleted, onPublished,
}: Props) {
  const [finalInput, setFinalInput] = useState(record?.final_amount?.toString() ?? '')
  const [noteInput, setNoteInput] = useState(record?.note ?? '')
  const [extraItems, setExtraItems] = useState<ExtraPayItem[]>(record?.extra_items ?? [])
  const [extraDeductions, setExtraDeductions] = useState<ExtraPayItem[]>(record?.extra_deductions ?? [])
  const [taxType, setTaxType] = useState<TaxType>(initTaxType ?? '없음')
  const [salaryBasis, setSalaryBasis] = useState<'세전' | '세후'>(initBasis ?? '세전')
  const [saving, setSaving] = useState(false)
  const [paying, setPaying] = useState(false)
  const [savingWorker, setSavingWorker] = useState(false)
  const [payDate, setPayDate] = useState(defaultPayDate(month))
  const [incomeTax, setIncomeTax] = useState('0')
  const [publishing, setPublishing] = useState(false)
  const [showPayslipSection, setShowPayslipSection] = useState(false)

  const isPaid = record?.is_paid ?? false
  const base = finalInput.trim() !== '' ? Number(finalInput) : autoAmount
  const extraPayTotal = extraItems.reduce((s, it) => s + (it.amount || 0), 0)
  const extraDedTotal = extraDeductions.reduce((s, d) => s + (d.amount || 0), 0)
  const estimated = base + extraPayTotal - extraDedTotal

  const saveWorkerSettings = async (newTax: TaxType, newBasis: '세전' | '세후') => {
    if (!workerDbId) return
    setSavingWorker(true)
    try {
      const res = await fetch('/api/admin/workers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: workerDbId, tax_type: newTax, salary_basis: newBasis }),
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
    if (!workerDbId) return
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
        body: JSON.stringify({ month, personType, personId, payDate, incomeTax: Number(incomeTax) || 0 }),
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
      const fileName = `급여명세서_${personName}_${month}.pdf`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = fileName; a.click()
      URL.revokeObjectURL(url)

      const saveRes = await fetch('/api/admin/payroll/payslips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year_month: month, person_type: personType, person_id: personId,
          person_name: personName, pay_date: payDate, file_url: null, file_name: fileName,
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

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-surface rounded-t-2xl sm:rounded-2xl shadow-modal w-full sm:max-w-lg max-h-[92vh] flex flex-col">
        {/* sticky 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle shrink-0">
          <div>
            <p className="font-bold text-text-primary">{personName}</p>
            <p className="text-xs text-text-tertiary">{displayMonth} 급여 설정</p>
          </div>
          <div className="flex items-center gap-2">
            {isPaid && <span className="text-xs px-2 py-0.5 rounded-full bg-state-success-bg text-state-success font-semibold">지급완료</span>}
            <button onClick={onClose} className="p-1.5 text-text-tertiary hover:text-text-secondary rounded-lg hover:bg-surface-sunken">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 스크롤 본문 */}
        <div className="overflow-y-auto flex-1 p-4 space-y-4">

          {/* 기본 정보 */}
          {(phone || accountNumber) && (
            <div className="flex gap-3 text-xs text-text-secondary">
              {phone && <span>📞 {phone}</span>}
              {accountNumber && <span className="font-mono">🏦 {accountNumber}</span>}
            </div>
          )}

          {/* ── 세금 설정 */}
          <div className="bg-surface-sunken rounded-xl p-3 space-y-2.5">
            <p className="text-xs font-semibold text-text-secondary">세금 설정</p>
            <div className="flex items-center gap-3">
              <span className="text-xs text-text-tertiary w-14 shrink-0">급여 기준</span>
              <button
                onClick={handleBasisToggle}
                disabled={savingWorker || !workerDbId}
                title={!workerDbId ? '직원(workers) 매핑 필요' : '클릭하여 세전↔세후 전환'}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors disabled:cursor-not-allowed ${
                  !workerDbId
                    ? 'bg-surface text-text-tertiary border-border-subtle'
                    : salaryBasis === '세후'
                      ? 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100'
                      : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                }`}
              >
                {savingWorker ? '...' : salaryBasis}{!workerDbId ? ' (편집불가)' : ' ↕'}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-text-tertiary w-14 shrink-0">세금 유형</span>
              <select
                value={taxType}
                onChange={e => handleTaxChange(e.target.value as TaxType)}
                disabled={savingWorker || !workerDbId}
                className="flex-1 px-2 py-1.5 border border-border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-surface disabled:cursor-not-allowed"
              >
                {TAX_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── 급여 조정 */}
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

          {/* ── 추가 지급 */}
          <div>
            <p className="text-xs font-semibold text-text-secondary mb-2">추가 지급 항목</p>
            <ItemEditor items={extraItems} onChange={setExtraItems} variant="pay" />
          </div>

          {/* ── 추가 공제 */}
          <div>
            <p className="text-xs font-semibold text-red-700 mb-2">추가 공제 항목</p>
            <ItemEditor items={extraDeductions} onChange={setExtraDeductions} variant="deduction" />
          </div>

          {/* ── 급여 요약 */}
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

          {/* ── 저장 / 지급완료 */}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
            <button
              onClick={handleTogglePaid}
              disabled={paying}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-xl disabled:opacity-60 ${
                isPaid ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
            >
              {paying ? '처리 중...' : isPaid ? '지급 취소' : <><CreditCard size={14} className="inline mr-1" />지급완료</>}
            </button>
          </div>

          {/* ── 급여명세서 (접기/펼치기) */}
          <div className="border-t border-dashed border-border-subtle pt-3">
            <button
              onClick={() => setShowPayslipSection(v => !v)}
              className="w-full flex items-center justify-between text-sm font-bold text-text-primary"
            >
              <span className="flex items-center gap-1.5"><FileText size={14} className="text-brand-600" />급여명세서</span>
              {showPayslipSection ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showPayslipSection && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="text-xs font-medium text-text-secondary block mb-1">지급일</label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={e => setPayDate(e.target.value)}
                    disabled={publishing}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-surface-sunken"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-text-secondary block mb-1">소득세</label>
                  <input
                    type="number"
                    value={incomeTax}
                    onChange={e => setIncomeTax(e.target.value)}
                    placeholder="0"
                    disabled={publishing}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-surface-sunken"
                  />
                  <p className="text-[11px] text-text-tertiary mt-1">※ 프리랜서3.3%는 자동 계산됩니다.</p>
                </div>
                <button
                  onClick={handlePublish}
                  disabled={publishing}
                  className="w-full py-2.5 text-sm font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  <FileText size={14} />
                  {publishing ? '발행 중...' : 'PDF 명세서 발행'}
                </button>

                {payslips.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-text-secondary mb-2">발행 이력 ({payslips.length}건)</p>
                    <PayslipList payslips={payslips} onUpdated={onPayslipUpdated} onDeleted={onPayslipDeleted} />
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
