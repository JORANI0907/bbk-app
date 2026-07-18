'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { ChevronLeft, Plus, Star, Pencil, Trash2, Copy } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

interface Supplier {
  id: string
  label: string
  registration_number: string
  company_name: string
  representative: string
  address: string
  business_type: string
  business_item: string
  email: string
  is_default: boolean
  created_at: string
  updated_at: string
}

const EMPTY_FORM: Omit<Supplier, 'id' | 'created_at' | 'updated_at'> = {
  label: '',
  registration_number: '',
  company_name: '',
  representative: '',
  address: '',
  business_type: '',
  business_item: '',
  email: '',
  is_default: false,
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/tax-invoice/suppliers')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '조회 실패')
      setSuppliers(json.suppliers ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '조회 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const handleSetDefault = async (s: Supplier) => {
    if (s.is_default) return
    try {
      const res = await fetch(`/api/admin/tax-invoice/suppliers/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_default: true }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '변경 실패')
      toast.success(`기본 공급자: ${s.label}`)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '변경 실패')
    }
  }

  const handleDelete = async (s: Supplier) => {
    if (s.is_default) {
      toast.error('기본 공급자는 삭제할 수 없습니다. 다른 공급자를 먼저 기본으로 지정하세요.')
      return
    }
    if (!confirm(`'${s.label}' 공급자를 삭제할까요?`)) return
    try {
      const res = await fetch(`/api/admin/tax-invoice/suppliers/${s.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '삭제 실패')
      toast.success('삭제됐습니다.')
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '삭제 실패')
    }
  }

  const handleDuplicate = (s: Supplier) => {
    setCreating(true)
    setEditing({
      ...s,
      id: '',
      label: `${s.label} 복제`,
      is_default: false,
      created_at: '',
      updated_at: '',
    })
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-text-tertiary">
        <Link href="/admin/tax-invoice" className="hover:text-text-primary flex items-center gap-1">
          <ChevronLeft size={14} />세금계산서 대시보드
        </Link>
      </div>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-text-primary tracking-tight">공급자 프리셋</h1>
          <p className="text-xs text-text-tertiary mt-1">
            세금계산서 발행 시 공급자 정보를 프리셋으로 관리합니다. 기본으로 지정한 공급자가 대시보드에서 자동 적용됩니다.
          </p>
        </div>
        <Button size="sm" onClick={() => { setCreating(true); setEditing({ ...EMPTY_FORM, id: '', created_at: '', updated_at: '' }) }}
          className="flex items-center gap-1.5">
          <Plus size={13} />신규 공급자
        </Button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-text-tertiary">로딩 중…</div>
      ) : suppliers.length === 0 ? (
        <div className="bg-surface border border-border-subtle rounded-2xl p-8 text-center text-sm text-text-tertiary">
          공급자가 없습니다.
        </div>
      ) : (
        <div className="grid gap-3">
          {suppliers.map(s => (
            <div key={s.id} className="bg-surface border border-border-subtle rounded-2xl p-4 md:p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="text-base font-semibold text-text-primary truncate">{s.label}</p>
                    {s.is_default && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-600 font-medium">
                        <Star size={9} />기본
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-text-primary">{s.company_name} · {s.representative}</p>
                  <p className="text-xs text-text-tertiary tabular-nums">사업자 {s.registration_number}</p>
                  {s.address && <p className="text-[11px] text-text-tertiary mt-1 truncate">{s.address}</p>}
                  {s.email && <p className="text-[11px] text-text-tertiary tabular-nums">{s.email}</p>}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {!s.is_default && (
                    <button type="button" onClick={() => handleSetDefault(s)}
                      className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-border-subtle text-text-secondary hover:bg-surface-sunken">
                      <Star size={11} />기본 설정
                    </button>
                  )}
                  <button type="button" onClick={() => handleDuplicate(s)}
                    className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-border-subtle text-text-secondary hover:bg-surface-sunken">
                    <Copy size={11} />복제
                  </button>
                  <button type="button" onClick={() => { setEditing(s); setCreating(false) }}
                    className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-border-subtle text-text-secondary hover:bg-surface-sunken">
                    <Pencil size={11} />편집
                  </button>
                  {!s.is_default && (
                    <button type="button" onClick={() => handleDelete(s)}
                      className="flex items-center justify-center w-6 h-6 rounded-md text-text-tertiary hover:text-state-danger hover:bg-state-danger-bg">
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <SupplierEditor
          initial={editing}
          isNew={creating}
          onClose={() => { setEditing(null); setCreating(false) }}
          onSaved={() => { setEditing(null); setCreating(false); void load() }}
        />
      )}
    </div>
  )
}

// ─── 편집 모달 ────────────────────────────────────────────
function SupplierEditor({
  initial, isNew, onClose, onSaved,
}: {
  initial: Supplier | (Omit<Supplier, 'id' | 'created_at' | 'updated_at'> & { id: string; created_at: string; updated_at: string })
  isNew: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)

  const update = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    if (!form.label.trim() || !form.registration_number.trim() || !form.company_name.trim() || !form.representative.trim()) {
      toast.error('별명·사업자번호·상호·대표자는 필수입니다.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        label: form.label,
        registration_number: form.registration_number,
        company_name: form.company_name,
        representative: form.representative,
        address: form.address,
        business_type: form.business_type,
        business_item: form.business_item,
        email: form.email,
        is_default: form.is_default,
      }
      const res = isNew || !form.id
        ? await fetch('/api/admin/tax-invoice/suppliers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/admin/tax-invoice/suppliers/${form.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '저장 실패')
      toast.success('저장됐습니다.')
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-y-auto p-6"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-text-primary">
            {isNew ? '신규 공급자' : '공급자 편집'}
          </h2>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary text-2xl leading-none">×</button>
        </div>

        <div className="space-y-3">
          <Field label="별명 (구분용)" required>
            <Input value={form.label} onChange={e => update('label', e.target.value)} placeholder="예: 범빌드코리아 본사" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="사업자등록번호" required>
              <Input value={form.registration_number} onChange={e => update('registration_number', e.target.value)} placeholder="0000000000" />
            </Field>
            <Field label="대표자" required>
              <Input value={form.representative} onChange={e => update('representative', e.target.value)} />
            </Field>
          </div>
          <Field label="상호" required>
            <Input value={form.company_name} onChange={e => update('company_name', e.target.value)} />
          </Field>
          <Field label="주소">
            <Input value={form.address} onChange={e => update('address', e.target.value)} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="업태">
              <Input value={form.business_type} onChange={e => update('business_type', e.target.value)} />
            </Field>
            <Field label="종목">
              <Input value={form.business_item} onChange={e => update('business_item', e.target.value)} />
            </Field>
          </div>
          <Field label="이메일">
            <Input type="email" value={form.email} onChange={e => update('email', e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer pt-2">
            <input type="checkbox" checked={form.is_default} onChange={e => update('is_default', e.target.checked)}
              className="accent-brand-600" />
            기본 공급자로 지정
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 mt-6">
          <Button variant="secondary" size="sm" onClick={onClose}>취소</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? '저장 중…' : '저장'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
        {label}{required && <span className="text-state-danger ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
