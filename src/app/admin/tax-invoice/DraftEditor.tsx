'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { X, Plus, Trash2, RotateCcw } from 'lucide-react'
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
  source: 'application' | 'billing'
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
}

interface Supplier {
  id: string
  label: string
  is_default: boolean
}

interface Props {
  candidate: CandidateSlim
  suppliers: Supplier[]
  onClose: () => void
  onSaved: () => void
}

const fmtKr = (n: number) => n.toLocaleString('ko-KR')

export function DraftEditor({ candidate, suppliers, onClose, onSaved }: Props) {
  const [receiverBusinessNumber, setReceiverBusinessNumber] = useState(candidate.business_number ?? '')
  const [receiverBusinessName, setReceiverBusinessName] = useState(candidate.business_name)
  const [receiverOwnerName, setReceiverOwnerName] = useState(candidate.owner_name)
  const [receiverAddress, setReceiverAddress] = useState(candidate.address ?? '')
  const [receiverEmail, setReceiverEmail] = useState(candidate.email ?? '')
  const [receiverBusinessType, setReceiverBusinessType] = useState('')
  const [receiverBusinessItem, setReceiverBusinessItem] = useState('')

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

  // draft 로드 (기존 저장된 상세 필드까지 완전 로드)
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
        setReceiverBusinessType(draft.receiver_business_type ?? '')
        setReceiverBusinessItem(draft.receiver_business_item ?? '')
        setNotes(draft.notes ?? '')
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateItem = (idx: number, patch: Partial<DraftItem>) => {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it
      const next = { ...it, ...patch }
      // qty·unit_price 변경 시 supply_amount·vat 자동 계산
      if ('qty' in patch || 'unit_price' in patch) {
        const q = Number(next.qty ?? 1)
        const p = Number(next.unit_price ?? 0)
        next.supply_amount = q * p
        next.vat = Math.round(q * p * 0.1)
      }
      return next
    }))
  }

  const addItem = () => setItems(prev => [...prev, { name: '', qty: 1, unit_price: 0, supply_amount: 0, vat: 0 }])
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))

  const totalSupply = items.reduce((s, i) => s + Number(i.supply_amount ?? 0), 0)
  const totalVat = items.reduce((s, i) => s + Number(i.vat ?? 0), 0)
  const totalAmount = totalSupply + totalVat

  const handleSave = async () => {
    if (!receiverBusinessName.trim()) { toast.error('상호는 필수입니다.'); return }
    if (items.length === 0) { toast.error('품목을 1개 이상 추가하세요.'); return }
    if (items.some(i => !i.name.trim())) { toast.error('품목명이 비어있는 항목이 있습니다.'); return }

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
          receiver_business_type: receiverBusinessType.trim() || null,
          receiver_business_item: receiverBusinessItem.trim() || null,
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
            <p className="text-[11px] text-text-tertiary">{candidate.service_type ?? '—'} · {candidate.source === 'application' ? '서비스관리' : '고객관리(청구)'} </p>
          </div>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary p-1">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-6">

          {/* 공급자 프리셋 */}
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

          {/* 공급받는자 */}
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
              <Field label="이메일">
                <Input value={receiverEmail} onChange={e => setReceiverEmail(e.target.value)} />
              </Field>
              <Field label="업태">
                <Input value={receiverBusinessType} onChange={e => setReceiverBusinessType(e.target.value)} />
              </Field>
              <Field label="종목">
                <Input value={receiverBusinessItem} onChange={e => setReceiverBusinessItem(e.target.value)} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="주소">
                  <Input value={receiverAddress} onChange={e => setReceiverAddress(e.target.value)} />
                </Field>
              </div>
            </div>
          </Section>

          {/* 품목 */}
          <Section title="품목">
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
              <button onClick={addItem}
                className="w-full py-2 border border-dashed border-border rounded-xl text-xs text-text-secondary hover:border-brand-400 hover:text-brand-600 flex items-center justify-center gap-1 transition-colors">
                <Plus size={12} />품목 추가
              </button>
            </div>

            <div className="mt-3 flex items-center justify-end gap-4 text-sm border-t border-border-subtle pt-3">
              <span className="text-text-tertiary">공급 <b className="text-text-primary tabular-nums">{fmtKr(totalSupply)}</b>원</span>
              <span className="text-text-tertiary">세액 <b className="text-text-primary tabular-nums">{fmtKr(totalVat)}</b>원</span>
              <span className="font-semibold">합계 <b className="text-brand-600 tabular-nums">{fmtKr(totalAmount)}</b>원</span>
            </div>
          </Section>

          {/* 비고 */}
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
