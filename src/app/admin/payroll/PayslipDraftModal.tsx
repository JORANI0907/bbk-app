'use client'

import { useState, useMemo, useCallback, type ReactElement, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import {
  X, CreditCard, FileText, Plus, ChevronDown, ChevronUp,
  User, Wallet, Briefcase, History,
} from 'lucide-react'
import { Button } from '@/components/ui'
import PayslipList, { type PayslipEntry } from './PayslipList'
import PayslipModal from './PayslipModal'
import type { PayrollRecord, ExtraPayItem, TaxType } from './types'
import { computePayslip } from '@/lib/payroll/payslipCalc'
import type { DocumentProps } from '@react-pdf/renderer'
import type { PayslipData } from './PayslipPDF'

// ─── 유틸 ────────────────────────────────────────────────────────────────────

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
  { label: '식대', amount: 100000 }, { label: '교통비', amount: 100000 },
  { label: '야근수당', amount: 0 }, { label: '주휴수당', amount: 0 },
  { label: '상여금', amount: 0 }, { label: '직책수당', amount: 0 },
  { label: '명절수당', amount: 0 }, { label: '연장근로수당', amount: 0 },
]

const DEDUCTION_PRESETS = [
  { label: '손망실', amount: 0 }, { label: '선지급 회수', amount: 0 },
  { label: '가불 회수', amount: 0 }, { label: '지각·조퇴', amount: 0 },
  { label: '결근공제', amount: 0 },
]

// ─── 아이템 편집기 (추가 지급 · 추가 공제 공용) ─────────────────────────────

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

// ─── 아코디언 섹션 (접기/펼치기) ────────────────────────────────────────────

function Section({
  icon, title, subtitle, defaultOpen = false, badge, children,
}: {
  icon: ReactNode
  title: string
  subtitle?: string
  defaultOpen?: boolean
  badge?: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-border-subtle rounded-xl overflow-hidden bg-surface">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-surface-sunken transition-colors"
      >
        <span className="text-brand-600 shrink-0">{icon}</span>
        <div className="flex-1 text-left min-w-0">
          <p className="text-sm font-semibold text-text-primary leading-tight">{title}</p>
          {subtitle && <p className="text-[11px] text-text-tertiary leading-tight mt-0.5 truncate">{subtitle}</p>}
        </div>
        {badge}
        {open ? <ChevronUp size={16} className="text-text-tertiary shrink-0" /> : <ChevronDown size={16} className="text-text-tertiary shrink-0" />}
      </button>
      {open && <div className="border-t border-border-subtle p-3">{children}</div>}
    </div>
  )
}

// ─── Props ──────────────────────────────────────────────────────────────────

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

// ─── Component ──────────────────────────────────────────────────────────────

export default function PayslipDraftModal({
  workerId, workerName, month,
  personType, personId, phone, accountNumber,
  taxType: initTaxType, salaryBasis: initBasis, autoAmount, record,
  payslips, onClose, onUpdated, onPayslipUpdated, onPayslipDeleted, onPublished,
}: Props) {
  // 상태
  const [finalInput, setFinalInput] = useState(record?.final_amount?.toString() ?? '')
  const [noteInput, setNoteInput] = useState(record?.note ?? '')
  const [extraItems, setExtraItems] = useState<ExtraPayItem[]>(record?.extra_items ?? [])
  const [extraDeductions, setExtraDeductions] = useState<ExtraPayItem[]>(record?.extra_deductions ?? [])
  const [taxType, setTaxType] = useState<TaxType>(initTaxType ?? '없음')
  const [salaryBasis, setSalaryBasis] = useState<'세전' | '세후'>(initBasis ?? '세전')

  const [saving, setSaving] = useState(false)
  const [paying, setPaying] = useState(false)
  const [savingWorker, setSavingWorker] = useState(false)
  const [showPayslipModal, setShowPayslipModal] = useState(false)

  const isPaid = record?.is_paid ?? false
  const [y, m] = month.split('-')
  const displayMonth = `${y}년 ${Number(m)}월`

  // ── 실시간 계산 (payslipCalc 공용 함수) ──────────────────────────────────
  const calc = useMemo(() => computePayslip({
    autoAmount,
    finalAmount: finalInput.trim() === '' ? null : Number(finalInput),
    extraItems: extraItems.filter(it => it.label.trim() !== ''),
    extraDeductions: extraDeductions.filter(d => d.label.trim() !== ''),
    taxType,
    salaryBasis,
    incomeTax: 0,
  }), [autoAmount, finalInput, extraItems, extraDeductions, taxType, salaryBasis])

  // ── 워커 설정 저장 (세금유형/기준) ──────────────────────────────────────
  const saveWorkerSettings = useCallback(async (newTax: TaxType, newBasis: '세전' | '세후') => {
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
  }, [workerId])

  const handleTaxChange = async (v: TaxType) => {
    setTaxType(v)
    await saveWorkerSettings(v, salaryBasis)
  }
  const handleBasisToggle = async () => {
    const next: '세전' | '세후' = salaryBasis === '세전' ? '세후' : '세전'
    setSalaryBasis(next)
    await saveWorkerSettings(taxType, next)
  }

  // ── 급여 조정 저장 ───────────────────────────────────────────────────────
  const handleSave = useCallback(async (opts?: { silent?: boolean }): Promise<boolean> => {
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
      if (!opts?.silent) toast.success('저장되었습니다.')
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패')
      return false
    } finally {
      setSaving(false)
    }
  }, [month, personType, personId, autoAmount, finalInput, noteInput, extraItems, extraDeductions, onUpdated])

  // ── 지급완료 토글 ────────────────────────────────────────────────────────
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

  // ── 급여명세서 발행 (자동 저장 후 팝업) ─────────────────────────────────
  const handleOpenPayslipModal = async () => {
    const ok = await handleSave({ silent: true })
    if (ok) {
      toast.success('저장 완료 · 발행 창을 엽니다')
      setShowPayslipModal(true)
    }
  }

  // ── 빠른 PDF 발행 (기본 지급일 · 소득세 0) ───────────────────────────────
  const [payDate, setPayDate] = useState(defaultPayDate(month))
  const [incomeTax, setIncomeTax] = useState('0')
  const [publishing, setPublishing] = useState(false)

  const handleQuickPublish = async () => {
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

  // ─── JSX ──────────────────────────────────────────────────────────────────

  const fmt = (n: number) => n.toLocaleString('ko-KR')

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="bg-surface w-full sm:max-w-lg sm:mx-4 rounded-t-2xl sm:rounded-2xl shadow-modal flex flex-col max-h-[92vh]">

          {/* 헤더 (고정) */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle shrink-0">
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-bold text-text-primary leading-tight">{workerName}</h2>
              <p className="text-[11px] text-text-tertiary">{displayMonth} 급여 관리</p>
            </div>
            {isPaid && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-state-success-bg text-state-success font-semibold flex items-center gap-0.5">
                <CreditCard size={10} />지급완료
              </span>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-sunken shrink-0">
              <X size={16} className="text-text-secondary" />
            </button>
          </div>

          {/* 스크롤 본문 */}
          <div className="flex-1 overflow-y-auto overscroll-contain">

            {/* Sticky 요약 카드 */}
            <div className="sticky top-0 z-10 bg-gradient-to-br from-brand-600 to-brand-700 text-white px-4 py-3 shadow-sm">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] uppercase opacity-80 leading-none">지급 합계</p>
                  <p className="text-sm font-bold mt-1">{fmt(calc.grossTotal)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase opacity-80 leading-none">공제 합계</p>
                  <p className="text-sm font-bold mt-1">−{fmt(calc.deductions.total + calc.extraDeductionsTotal)}</p>
                </div>
                <div className="border-l border-white/30 pl-2">
                  <p className="text-[10px] uppercase opacity-80 leading-none">실지급 예상</p>
                  <p className="text-base font-extrabold mt-1">{fmt(calc.netPay)}</p>
                </div>
              </div>
              <p className="text-[10px] opacity-80 text-center mt-1.5">
                ※ 소득세는 명세서 발행 시 개별 지정 · 위 계산은 소득세 0 기준
              </p>
            </div>

            <div className="p-4 space-y-3">

              {/* 섹션 1 · 기본 정보 (전화·계좌) — 접힘 기본 */}
              {(phone || accountNumber) && (
                <Section icon={<User size={14} />} title="기본 정보" subtitle="연락처·계좌">
                  <div className="space-y-1 text-xs text-text-secondary">
                    {phone && <p>📞 {phone}</p>}
                    {accountNumber && <p className="font-mono">🏦 {accountNumber}</p>}
                  </div>
                </Section>
              )}

              {/* 섹션 2 · 세금 설정 — 펼침 기본 */}
              <Section
                icon={<Briefcase size={14} />}
                title="세금 설정"
                subtitle={`${taxType} · ${salaryBasis}`}
                defaultOpen
              >
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-text-tertiary w-16 shrink-0">급여 기준</span>
                    <button
                      onClick={handleBasisToggle}
                      disabled={savingWorker}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                        salaryBasis === '세후'
                          ? 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      {savingWorker ? '...' : salaryBasis} ↕
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-text-tertiary w-16 shrink-0">세금 유형</span>
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
              </Section>

              {/* 섹션 3 · 지급 조정 (기본급 · 추가지급 · 추가공제) — 펼침 기본 */}
              <Section
                icon={<Wallet size={14} />}
                title="지급 조정"
                subtitle={`기본급 ${fmt(calc.basePay)} · 추가지급 +${fmt(calc.extraItemsTotal)} · 추가공제 −${fmt(calc.extraDeductionsTotal)}`}
                defaultOpen
              >
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-semibold text-text-tertiary block mb-1">기본급 (최종 조정)</label>
                    <input
                      type="number"
                      value={finalInput}
                      onChange={e => setFinalInput(e.target.value)}
                      placeholder={`자동 ${fmt(autoAmount)}원`}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-text-tertiary block mb-1">메모</label>
                    <input
                      type="text"
                      value={noteInput}
                      onChange={e => setNoteInput(e.target.value)}
                      placeholder="관리자 메모"
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-text-tertiary mb-1.5">추가 지급 항목</p>
                    <ItemEditor items={extraItems} onChange={setExtraItems} variant="pay" />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-red-700 mb-1.5">추가 공제 항목</p>
                    <ItemEditor items={extraDeductions} onChange={setExtraDeductions} variant="deduction" />
                  </div>
                </div>
              </Section>

              {/* 섹션 4 · 명세서 발행 옵션 — 접힘 기본 */}
              <Section
                icon={<FileText size={14} />}
                title="빠른 PDF 발행"
                subtitle="지급일·소득세 지정 후 이 창에서 즉시 발행"
              >
                <div className="space-y-2.5">
                  <div>
                    <label className="text-[11px] font-semibold text-text-tertiary block mb-1">지급일</label>
                    <input
                      type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                      disabled={publishing}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-text-tertiary block mb-1">소득세 (4대보험 인원만)</label>
                    <input
                      type="number" value={incomeTax} onChange={e => setIncomeTax(e.target.value)}
                      placeholder="0" disabled={publishing}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <p className="text-[10px] text-text-tertiary mt-1">※ 프리랜서3.3%는 자동 계산됩니다.</p>
                  </div>
                  <button
                    onClick={handleQuickPublish} disabled={publishing}
                    className="w-full py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-1.5"
                  >
                    <FileText size={13} />
                    {publishing ? '발행 중...' : '즉시 PDF 발행 (로컬 다운로드)'}
                  </button>
                </div>
              </Section>

              {/* 섹션 5 · 발행이력 — 접힘 기본 */}
              <Section
                icon={<History size={14} />}
                title="발행 이력"
                subtitle={payslips.length > 0 ? `${payslips.length}건 발행됨` : '발행 이력 없음'}
                badge={
                  payslips.length > 0 ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700 font-semibold">
                      {payslips.length}
                    </span>
                  ) : undefined
                }
              >
                {payslips.length > 0 ? (
                  <PayslipList payslips={payslips} onUpdated={onPayslipUpdated} onDeleted={onPayslipDeleted} />
                ) : (
                  <p className="text-xs text-text-tertiary text-center py-2">이 달의 발행 이력이 없습니다.</p>
                )}
              </Section>

            </div>
          </div>

          {/* 하단 sticky 액션바 */}
          <div className="border-t border-border-subtle px-4 py-3 shrink-0 flex gap-2 bg-surface">
            <Button onClick={() => { void handleSave() }} disabled={saving} className="flex-1">
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
              onClick={handleOpenPayslipModal}
              disabled={saving}
              title="저장 후 발행 창(Drive 저장·소득세 지정)이 열립니다"
              className="flex-1 flex items-center justify-center gap-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60"
            >
              <FileText size={13} />{saving ? '저장 중...' : '명세서 발행'}
            </Button>
          </div>
        </div>
      </div>

      {showPayslipModal && (
        <PayslipModal
          month={month}
          displayMonth={displayMonth}
          selectedPersons={[`${personType}:${personId}`]}
          onClose={() => setShowPayslipModal(false)}
          onPublished={() => {
            onPublished()
            setShowPayslipModal(false)
          }}
        />
      )}
    </>
  )
}
