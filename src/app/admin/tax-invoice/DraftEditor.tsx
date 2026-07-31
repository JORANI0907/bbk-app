'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { X, Plus, Trash2, RotateCcw, Check, CreditCard, FileCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'

export interface DraftItem {
  name: string
  spec?: string
  qty?: number
  unit_price?: number
  supply_amount?: number
  vat?: number
  remark?: string
}

export interface CandidateSlim {
  source: 'application' | 'billing' | 'customer'
  source_id: string
  business_name: string
  business_number: string | null
  owner_name: string
  address: string | null
  email: string | null
  supply_amount: number
  vat: number
  service_type: string | null
  has_draft: boolean
  draft_supplier_id: string | null
  draft_items: DraftItem[] | null
  // 홈택스 CSV 전용 draft 필드
  draft_receiver_business_type?: string | null
  draft_receiver_business_item?: string | null
  draft_receiver_email_2?: string | null
  draft_receipt_type?: string | null
  draft_invoice_kind?: string | null
  // 1회성케어 상태 (application 소스)
  application_id?: string | null
  application_status?: string | null
  tax_invoice_issued?: boolean
}

const MAX_ITEMS = 4  // 홈택스 CSV는 슬롯 4개까지 지원

// 결제완료로 간주하는 status 값 목록
const PAYMENT_COMPLETE_STATUSES = ['결제완료', '결제완료(잔금)', '계산서발행완료']

interface Supplier {
  id: string
  label: string
  is_default: boolean
}

interface Schedule {
  id: string
  scheduled_date: string
  payment_amount: number | null
  status: string | null
}

interface ContractInfo {
  monthly_price: number
  supply_amount: number
  vat: number
}

interface Props {
  candidate: CandidateSlim
  suppliers: Supplier[]
  scheduleMonth?: string | null   // YYYY-MM (현재 뷰 월)
  onClose: () => void
  onSaved: () => void
  onStatusChanged?: () => void    // 상태 토글 후 목록만 갱신, 드로어 유지
}

const fmtKr = (n: number) => n.toLocaleString('ko-KR')

export function DraftEditor({ candidate, suppliers, scheduleMonth, onClose, onSaved, onStatusChanged }: Props) {
  const [receiverBusinessNumber, setReceiverBusinessNumber] = useState(candidate.business_number ?? '')
  const [receiverBusinessName, setReceiverBusinessName] = useState(candidate.business_name)
  const [receiverOwnerName, setReceiverOwnerName] = useState(candidate.owner_name)
  const [receiverAddress, setReceiverAddress] = useState(candidate.address ?? '')
  const [receiverEmail, setReceiverEmail] = useState(candidate.email ?? '')
  const [receiverEmail2, setReceiverEmail2] = useState(candidate.draft_receiver_email_2 ?? '')
  const [receiverBusinessType, setReceiverBusinessType] = useState(candidate.draft_receiver_business_type ?? '')
  const [receiverBusinessItem, setReceiverBusinessItem] = useState(candidate.draft_receiver_business_item ?? '')
  const [receiptType, setReceiptType] = useState<'01' | '02'>(
    (candidate.draft_receipt_type === '02' ? '02' : '01') as '01' | '02',
  )

  const [supplierId, setSupplierId] = useState(candidate.draft_supplier_id ?? '')

  const [items, setItems] = useState<DraftItem[]>(
    candidate.draft_items && candidate.draft_items.length > 0
      ? candidate.draft_items
      : [{
          name: `${candidate.service_type ?? '서비스'} - ${candidate.business_name}`,
          qty: 1,
          unit_price: candidate.supply_amount,
          supply_amount: candidate.supply_amount,
          vat: candidate.vat,
        }],
  )

  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)

  // 정기케어: 계약 기준가 + 이번달 일정
  const [contractInfo, setContractInfo] = useState<ContractInfo | null>(null)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [schedulesLoading, setSchedulesLoading] = useState(false)
  const [selectedScheduleId, setSelectedScheduleId] = useState('')

  // 1회성케어: 로컬 상태 (즉시 반영용)
  const [paymentComplete, setPaymentComplete] = useState(
    PAYMENT_COMPLETE_STATUSES.includes(candidate.application_status ?? '')
  )
  const [invoiceIssued, setInvoiceIssued] = useState(candidate.tax_invoice_issued ?? false)
  const [statusUpdating, setStatusUpdating] = useState(false)

  // 정기케어 → 계약 기준가 + 이번달 일정 로드
  useEffect(() => {
    if (candidate.source !== 'customer') return
    setSchedulesLoading(true)

    const month = scheduleMonth ?? (() => {
      const d = new Date()
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })()

    fetch(`/api/admin/tax-invoice/customer-context?customer_id=${candidate.source_id}&month=${month}`)
      .then(r => r.json())
      .then(d => {
        if (d.contract) setContractInfo(d.contract)
        setSchedules(d.schedules ?? [])
      })
      .catch(() => {})
      .finally(() => setSchedulesLoading(false))
  }, [candidate.source, candidate.source_id, scheduleMonth])

  // 계약 기준가 로드 후 → draft 없는 경우 items 자동 초기화
  useEffect(() => {
    if (!contractInfo) return
    if (candidate.source !== 'customer') return
    if (candidate.draft_items && candidate.draft_items.length > 0) return
    setItems([{
      name: `${candidate.service_type ?? '서비스'} - ${candidate.business_name}`,
      qty: 1,
      unit_price: contractInfo.supply_amount,
      supply_amount: contractInfo.supply_amount,
      vat: contractInfo.vat,
    }])
  }, [contractInfo])  // eslint-disable-line react-hooks/exhaustive-deps

  // draft 로드 (기존 저장된 상세 필드까지)
  useEffect(() => {
    if (!candidate.has_draft) return
    fetch(`/api/admin/tax-invoice/drafts?source=${candidate.source}&source_id=${candidate.source_id}`)
      .then(r => r.json())
      .then(d => {
        const draft = d.draft
        if (!draft) return
        setReceiverBusinessNumber(draft.receiver_business_number ?? receiverBusinessNumber)
        setReceiverBusinessName(draft.receiver_business_name ?? receiverBusinessName)
        setReceiverOwnerName(draft.receiver_owner_name ?? receiverOwnerName)
        setReceiverAddress(draft.receiver_address ?? receiverAddress)
        setReceiverEmail(draft.receiver_email ?? receiverEmail)
        setReceiverEmail2(draft.receiver_email_2 ?? '')
        setReceiverBusinessType(draft.receiver_business_type ?? '')
        setReceiverBusinessItem(draft.receiver_business_item ?? '')
        if (draft.bill_receipt_type === '01' || draft.bill_receipt_type === '02') {
          setReceiptType(draft.bill_receipt_type)
        }
        setNotes(draft.notes ?? '')
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateItem = (idx: number, patch: Partial<DraftItem>) => {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it
      const next = { ...it, ...patch }
      if ('qty' in patch || 'unit_price' in patch) {
        const q = Number(next.qty ?? 1)
        const p = Number(next.unit_price ?? 0)
        next.supply_amount = q * p
        next.vat = Math.round(q * p * 0.1)
      }
      return next
    }))
  }

  const addItem = () => {
    if (items.length >= MAX_ITEMS) {
      toast.error(`품목은 최대 ${MAX_ITEMS}개까지만 추가할 수 있습니다.`)
      return
    }
    setItems(prev => [...prev, { name: '', qty: 1, unit_price: 0, supply_amount: 0, vat: 0 }])
  }
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))

  // 이번달 일정 선택 → items[0] 금액 업데이트
  const handleScheduleSelect = (scheduleId: string) => {
    setSelectedScheduleId(scheduleId)
    if (!scheduleId) {
      // "계약 기준가" 복원
      if (contractInfo) {
        updateItemPrice(contractInfo.supply_amount, contractInfo.vat)
      }
      return
    }
    const schedule = schedules.find(s => s.id === scheduleId)
    if (!schedule) return

    if (schedule.payment_amount != null) {
      const total = schedule.payment_amount
      const supply = Math.round(total / 1.1)
      const vat = total - supply
      updateItemPrice(supply, vat)
    } else if (contractInfo) {
      updateItemPrice(contractInfo.supply_amount, contractInfo.vat)
    }
  }

  const updateItemPrice = (supply: number, vat: number) => {
    setItems(prev => prev.map((it, i) =>
      i === 0
        ? { ...it, unit_price: supply, supply_amount: supply, vat }
        : it
    ))
  }

  // 결제완료 토글 (1회성케어)
  const handlePaymentCompleteToggle = async () => {
    if (!candidate.application_id) return
    const next = !paymentComplete
    setStatusUpdating(true)
    try {
      const res = await fetch('/api/admin/tax-invoice/application-status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: candidate.application_id, payment_complete: next }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '상태 변경 실패')
      setPaymentComplete(next)
      toast.success(next ? '결제완료로 변경했습니다.' : '결제완료 해제했습니다.')
      onStatusChanged?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '상태 변경 실패')
    } finally {
      setStatusUpdating(false)
    }
  }

  // 세금계산서 발행완료 토글 (1회성케어)
  const handleInvoiceIssuedToggle = async () => {
    if (!candidate.application_id) return
    const next = !invoiceIssued
    setStatusUpdating(true)
    try {
      const res = await fetch('/api/admin/tax-invoice/application-status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: candidate.application_id, tax_invoice_issued: next }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '상태 변경 실패')
      setInvoiceIssued(next)
      toast.success(next ? '세금계산서 발행완료 처리했습니다.' : '발행완료 해제했습니다.')
      onStatusChanged?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '상태 변경 실패')
    } finally {
      setStatusUpdating(false)
    }
  }

  const totalSupply = items.reduce((s, i) => s + Number(i.supply_amount ?? 0), 0)
  const totalVat = items.reduce((s, i) => s + Number(i.vat ?? 0), 0)
  const totalAmount = totalSupply + totalVat

  const handleSave = async () => {
    if (!receiverBusinessName.trim()) { toast.error('상호는 필수입니다.'); return }
    if (items.length === 0) { toast.error('품목을 1개 이상 추가하세요.'); return }
    if (items.some(i => !i.name.trim())) { toast.error('품목명이 비어있는 항목이 있습니다.'); return }
    if (items.length > MAX_ITEMS) { toast.error(`품목은 ${MAX_ITEMS}개까지만 저장 가능합니다.`); return }

    setSaving(true)
    try {
      const res = await fetch('/api/admin/tax-invoice/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: candidate.source,
          source_id: candidate.source_id,
          supplier_id: supplierId || null,
          receiver_business_number: receiverBusinessNumber.trim() || null,
          receiver_business_name: receiverBusinessName.trim(),
          receiver_owner_name: receiverOwnerName.trim() || null,
          receiver_address: receiverAddress.trim() || null,
          receiver_email: receiverEmail.trim() || null,
          receiver_email_2: receiverEmail2.trim() || null,
          receiver_business_type: receiverBusinessType.trim() || null,
          receiver_business_item: receiverBusinessItem.trim() || null,
          bill_receipt_type: receiptType,
          items,
          notes: notes.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '저장 실패')
      toast.success('편집 내용이 저장됐습니다.')
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!candidate.has_draft) { onClose(); return }
    if (!confirm('편집 내용을 삭제하고 원본으로 되돌릴까요?')) return
    setResetting(true)
    try {
      const res = await fetch(
        `/api/admin/tax-invoice/drafts?source=${candidate.source}&source_id=${candidate.source_id}`,
        { method: 'DELETE' },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '초기화 실패')
      toast.success('원본으로 복원됐습니다.')
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '초기화 실패')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="bg-surface w-full max-w-2xl h-full overflow-y-auto shadow-modal" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-surface border-b border-border-subtle px-5 py-3 flex items-center justify-between z-10">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-text-primary truncate">{candidate.business_name} · 발행 전 편집</h2>
            <p className="text-[11px] text-text-tertiary">
              {candidate.service_type ?? '—'} ·{' '}
              {candidate.source === 'application' ? '서비스관리' : '고객관리(청구)'}
            </p>
          </div>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary p-1">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-6">

          {/* ── 결제·계산서 상태 (1회성케어 전용) ── */}
          {candidate.source === 'application' && candidate.application_id && (
            <Section title="결제·계산서 상태">
              <p className="text-[11px] text-text-tertiary mb-2">
                클릭으로 즉시 변경 — 저장 버튼 불필요, 드로어 유지
              </p>
              <div className="flex items-center gap-3">
                <StatusToggleBtn
                  icon={<CreditCard size={13} />}
                  label="결제완료"
                  active={paymentComplete}
                  disabled={statusUpdating}
                  onClick={handlePaymentCompleteToggle}
                />
                <StatusToggleBtn
                  icon={<FileCheck size={13} />}
                  label="세금계산서 발행완료"
                  active={invoiceIssued}
                  disabled={statusUpdating}
                  onClick={handleInvoiceIssuedToggle}
                />
              </div>
            </Section>
          )}

          {/* ── 이번달 일정 불러오기 (정기케어 전용) ── */}
          {candidate.source === 'customer' && (
            <Section title="이번달 일정">
              {schedulesLoading ? (
                <p className="text-xs text-text-tertiary">일정 로딩 중…</p>
              ) : (
                <>
                  <select
                    value={selectedScheduleId}
                    onChange={e => handleScheduleSelect(e.target.value)}
                    className="w-full text-sm rounded-md border border-border bg-surface px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                  >
                    <option value="">
                      계약 기준가 사용
                      {contractInfo ? ` (공급가 ${fmtKr(contractInfo.supply_amount)}원)` : ''}
                    </option>
                    {schedules.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.scheduled_date} · {s.status ?? '—'}
                        {s.payment_amount != null
                          ? ` — ${fmtKr(s.payment_amount)}원 (별도 금액)`
                          : contractInfo
                            ? ` — ${fmtKr(contractInfo.monthly_price)}원 (계약가)`
                            : ''}
                      </option>
                    ))}
                  </select>
                  {schedules.length === 0 && !schedulesLoading && (
                    <p className="text-[11px] text-text-tertiary mt-1">이번 달 등록된 일정이 없습니다.</p>
                  )}
                  <p className="text-[11px] text-text-tertiary mt-1">
                    일정 선택 시 별도 금액이 있으면 그 금액, 없으면 계약 기준가로 품목 공급가액이 업데이트됩니다.
                  </p>
                </>
              )}
            </Section>
          )}

          {/* ── 공급자 프리셋 ── */}
          <Section title="공급자 프리셋">
            <select
              value={supplierId}
              onChange={e => setSupplierId(e.target.value)}
              className="w-full text-sm rounded-md border border-border bg-surface px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
            >
              <option value="">대시보드 기본값 사용</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.label}{s.is_default ? ' ★' : ''}</option>
              ))}
            </select>
            <p className="text-[11px] text-text-tertiary mt-1">이 건에 한해서 다른 공급자로 발행할 때만 지정하세요.</p>
          </Section>

          {/* ── 공급받는자 ── */}
          <Section title="공급받는자 정보">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="사업자등록번호">
                <Input value={receiverBusinessNumber} onChange={e => setReceiverBusinessNumber(e.target.value)} />
              </Field>
              <Field label="상호 *">
                <Input value={receiverBusinessName} onChange={e => setReceiverBusinessName(e.target.value)} />
              </Field>
              <Field label="대표자">
                <Input value={receiverOwnerName} onChange={e => setReceiverOwnerName(e.target.value)} />
              </Field>
              <Field label="이메일1">
                <Input value={receiverEmail} onChange={e => setReceiverEmail(e.target.value)} />
              </Field>
              <Field label="이메일2 (선택)">
                <Input value={receiverEmail2} onChange={e => setReceiverEmail2(e.target.value)} placeholder="추가 수신 이메일" />
              </Field>
              <Field label="업태 (선택 · 없어도 발행)">
                <Input value={receiverBusinessType} onChange={e => setReceiverBusinessType(e.target.value)} placeholder="예: 음식점업" />
              </Field>
              <Field label="종목 (선택 · 없어도 발행)">
                <Input value={receiverBusinessItem} onChange={e => setReceiverBusinessItem(e.target.value)} placeholder="예: 한식" />
              </Field>
              <div className="sm:col-span-2">
                <Field label="주소">
                  <Input value={receiverAddress} onChange={e => setReceiverAddress(e.target.value)} />
                </Field>
              </div>
            </div>
          </Section>

          {/* ── 품목 ── */}
          <Section title={`품목 (${items.length}/${MAX_ITEMS})`}>
            <p className="text-[11px] text-text-tertiary mb-2">
              홈택스 세금계산서 CSV는 한 건당 최대 {MAX_ITEMS}개 품목까지 지원됩니다.
            </p>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="border border-border-subtle rounded-xl p-3 bg-surface-sunken/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-medium text-text-secondary">품목 {idx + 1}</span>
                    {items.length > 1 && (
                      <button onClick={() => removeItem(idx)} className="text-text-tertiary hover:text-state-danger">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <div className="sm:col-span-6">
                      <Field label="품명">
                        <Input value={it.name} onChange={e => updateItem(idx, { name: e.target.value })} />
                      </Field>
                    </div>
                    <div className="sm:col-span-6">
                      <Field label="규격">
                        <Input value={it.spec ?? ''} onChange={e => updateItem(idx, { spec: e.target.value })} placeholder="선택" />
                      </Field>
                    </div>
                    <div className="sm:col-span-2">
                      <Field label="수량">
                        <Input type="number" value={it.qty ?? 1} onChange={e => updateItem(idx, { qty: Number(e.target.value) })} className="text-right" />
                      </Field>
                    </div>
                    <div className="sm:col-span-4">
                      <Field label="단가">
                        <Input type="number" value={it.unit_price ?? 0} onChange={e => updateItem(idx, { unit_price: Number(e.target.value) })} className="text-right" />
                      </Field>
                    </div>
                    <div className="sm:col-span-3">
                      <Field label="공급가액">
                        <Input type="number" value={it.supply_amount ?? 0} onChange={e => updateItem(idx, { supply_amount: Number(e.target.value) })} className="text-right" />
                      </Field>
                    </div>
                    <div className="sm:col-span-3">
                      <Field label="세액">
                        <Input type="number" value={it.vat ?? 0} onChange={e => updateItem(idx, { vat: Number(e.target.value) })} className="text-right" />
                      </Field>
                    </div>
                    <div className="sm:col-span-12">
                      <Field label="비고">
                        <Input value={it.remark ?? ''} onChange={e => updateItem(idx, { remark: e.target.value })} placeholder="선택" />
                      </Field>
                    </div>
                  </div>
                </div>
              ))}
              {items.length < MAX_ITEMS && (
                <button onClick={addItem}
                  className="w-full py-2 border border-dashed border-border rounded-xl text-xs text-text-secondary hover:border-brand-400 hover:text-brand-600 flex items-center justify-center gap-1 transition-colors">
                  <Plus size={12} />품목 추가
                </button>
              )}
              {items.length >= MAX_ITEMS && (
                <p className="text-[11px] text-text-tertiary text-center py-1">홈택스 슬롯 최대치 도달 ({MAX_ITEMS}/{MAX_ITEMS})</p>
              )}
            </div>

            <div className="mt-3 flex items-center justify-end gap-4 text-sm border-t border-border-subtle pt-3">
              <span className="text-text-tertiary">공급 <b className="text-text-primary tabular-nums">{fmtKr(totalSupply)}</b>원</span>
              <span className="text-text-tertiary">세액 <b className="text-text-primary tabular-nums">{fmtKr(totalVat)}</b>원</span>
              <span className="font-semibold">합계 <b className="text-brand-600 tabular-nums">{fmtKr(totalAmount)}</b>원</span>
            </div>
          </Section>

          {/* ── 영수/청구 ── */}
          <Section title="영수·청구 구분">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                <input type="radio" name="receiptType" value="01" checked={receiptType === '01'}
                  onChange={() => setReceiptType('01')} className="accent-brand-600" />
                영수(01) <span className="text-[11px] text-text-tertiary">대가를 받은 경우</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                <input type="radio" name="receiptType" value="02" checked={receiptType === '02'}
                  onChange={() => setReceiptType('02')} className="accent-brand-600" />
                청구(02) <span className="text-[11px] text-text-tertiary">아직 못 받은 경우</span>
              </label>
            </div>
          </Section>

          {/* ── 비고 ── */}
          <Section title="비고">
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="세금계산서 비고란에 표시할 내용 (선택)" />
          </Section>

          <div className="flex items-center justify-between gap-2 pt-2 pb-6 border-t border-border-subtle">
            {candidate.has_draft ? (
              <Button variant="secondary" size="sm" onClick={handleReset} disabled={resetting}
                className="flex items-center gap-1.5 text-state-danger">
                <RotateCcw size={12} />원본 복원
              </Button>
            ) : <div />}
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={onClose}>취소</Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? '저장 중…' : '저장'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 상태 토글 버튼 ─────────────────────────────────────────────
function StatusToggleBtn({
  icon, label, active, disabled, onClick,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 ${
        active
          ? 'bg-state-success-bg border-state-success text-state-success'
          : 'bg-surface border-border-subtle text-text-secondary hover:border-border hover:text-text-primary'
      }`}
    >
      {active ? <Check size={13} /> : icon}
      {label}
    </button>
  )
}

// ── 레이아웃 헬퍼 ──────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <span className="block w-[3px] h-[12px] rounded-full bg-brand-600 flex-shrink-0" />
        <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wide">{title}</h3>
      </div>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-text-tertiary uppercase tracking-wide mb-1">
        {label}
      </label>
      {children}
    </div>
  )
}
