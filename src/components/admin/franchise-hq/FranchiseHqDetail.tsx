'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { LogoUploader } from './LogoUploader'

interface BranchCustomer {
  id: string
  business_name: string
  address: string
}

interface HqInfo {
  id: string
  brand_name: string
  logo_url: string | null
  manager_name: string
  manager_phone: string
  is_active: boolean
}

interface Props {
  hq: HqInfo
  mappedBranches: BranchCustomer[]
  candidates: BranchCustomer[]
}

export function FranchiseHqDetail({ hq, mappedBranches, candidates }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    brand_name: hq.brand_name,
    logo_url: hq.logo_url ?? '',
    name: hq.manager_name,
    phone: hq.manager_phone,
    is_active: hq.is_active,
  })
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return candidates.slice(0, 30)
    return candidates
      .filter(
        (c) =>
          c.business_name.toLowerCase().includes(q) ||
          c.address.toLowerCase().includes(q)
      )
      .slice(0, 30)
  }, [candidates, search])

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const saveInfo = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/franchise-hq/${hq.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand_name: form.brand_name,
          logo_url: form.logo_url || null,
          name: form.name,
          phone: form.phone.replace(/-/g, ''),
          is_active: form.is_active,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '저장 실패')
      toast.success('저장되었습니다.')
      setEditing(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setBusy(false)
    }
  }

  const addBranches = async () => {
    if (selected.size === 0) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/franchise-hq/${hq.id}/branches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerIds: Array.from(selected) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '추가 실패')
      toast.success(`${data.added}개 지점이 추가되었습니다.`)
      setSelected(new Set())
      setSearch('')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '추가 실패')
    } finally {
      setBusy(false)
    }
  }

  const removeBranch = async (customerId: string) => {
    if (!confirm('이 지점 매핑을 제거하시겠습니까?')) return
    setBusy(true)
    try {
      const res = await fetch(
        `/api/admin/franchise-hq/${hq.id}/branches?customerId=${customerId}`,
        { method: 'DELETE' }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '제거 실패')
      toast.success('제거되었습니다.')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '제거 실패')
    } finally {
      setBusy(false)
    }
  }

  const deleteHq = async () => {
    if (!confirm(`정말로 "${hq.brand_name}" 본사를 삭제하시겠습니까?\n로그인 계정과 지점 매핑이 모두 제거됩니다.`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/franchise-hq/${hq.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '삭제 실패')
      toast.success('삭제되었습니다.')
      router.push('/admin/franchise-hq')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '삭제 실패')
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 본사 정보 카드 */}
      <section className="bg-surface border border-border-subtle rounded-2xl shadow-soft p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-text-primary">본사 정보</h2>
          {editing ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setEditing(false)
                  setForm({
                    brand_name: hq.brand_name,
                    logo_url: hq.logo_url ?? '',
                    name: hq.manager_name,
                    phone: hq.manager_phone,
                    is_active: hq.is_active,
                  })
                }}
                disabled={busy}
                className="px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-surface-sunken rounded-md"
              >
                취소
              </button>
              <button
                onClick={saveInfo}
                disabled={busy}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-md disabled:opacity-50"
              >
                저장
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50 rounded-md"
            >
              수정
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="브랜드명" value={form.brand_name} onChange={(v) => setForm((s) => ({ ...s, brand_name: v }))} readOnly={!editing} />
          {editing ? (
            <LogoUploader value={form.logo_url} onChange={(v) => setForm((s) => ({ ...s, logo_url: v }))} disabled={busy} />
          ) : (
            <div className="flex flex-col gap-2">
              <span className="block text-xs font-semibold text-text-secondary">로고</span>
              <div className="w-20 h-20 rounded-xl border border-border-subtle bg-surface-sunken flex items-center justify-center overflow-hidden">
                {form.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.logo_url} alt="로고" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[10px] text-text-tertiary">없음</span>
                )}
              </div>
            </div>
          )}
          <Field label="담당자명" value={form.name} onChange={(v) => setForm((s) => ({ ...s, name: v }))} readOnly={!editing} />
          <Field label="연락처" value={form.phone} onChange={(v) => setForm((s) => ({ ...s, phone: v }))} readOnly={!editing} />
          {editing && (
            <label className="flex items-center gap-2 md:col-span-2 mt-1 select-none">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((s) => ({ ...s, is_active: e.target.checked }))}
                className="w-4 h-4"
              />
              <span className="text-sm text-text-secondary">계정 활성화</span>
            </label>
          )}
        </div>

        <div className="mt-5 pt-4 border-t border-border-subtle flex items-center justify-end">
          <button
            onClick={deleteHq}
            disabled={busy}
            className="text-xs font-semibold text-state-danger hover:underline disabled:opacity-50"
          >
            본사 삭제
          </button>
        </div>
      </section>

      {/* 매핑된 지점 */}
      <section className="bg-surface border border-border-subtle rounded-2xl shadow-soft p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-text-primary">
            매핑된 지점 <span className="text-text-tertiary text-sm font-semibold">({mappedBranches.length}개)</span>
          </h2>
        </div>

        {mappedBranches.length === 0 ? (
          <p className="text-sm text-text-tertiary py-4 text-center">아직 매핑된 지점이 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {mappedBranches.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-3 p-3 bg-surface-sunken rounded-lg">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary truncate">{b.business_name}</p>
                  <p className="text-[11px] text-text-tertiary truncate break-keep">{b.address}</p>
                </div>
                <button
                  onClick={() => removeBranch(b.id)}
                  disabled={busy}
                  className="shrink-0 text-xs font-semibold text-state-danger hover:underline disabled:opacity-50"
                >
                  제거
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 지점 추가 */}
      <section className="bg-surface border border-border-subtle rounded-2xl shadow-soft p-5 md:p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-text-primary">지점 추가</h2>
          <button
            onClick={addBranches}
            disabled={busy || selected.size === 0}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-brand-600 rounded-md hover:bg-brand-700 disabled:opacity-50"
          >
            선택 {selected.size}개 추가
          </button>
        </div>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="고객사명 또는 주소로 검색"
          className="w-full px-3 py-2 border border-border rounded-md text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-brand-600"
        />

        <div className="max-h-96 overflow-y-auto flex flex-col gap-1.5">
          {filtered.length === 0 ? (
            <p className="text-xs text-text-tertiary py-4 text-center">검색 결과가 없습니다.</p>
          ) : (
            filtered.map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-surface-sunken cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggleSelect(c.id)}
                  className="w-4 h-4 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-text-primary truncate">{c.business_name}</p>
                  <p className="text-[11px] text-text-tertiary truncate break-keep">{c.address}</p>
                </div>
              </label>
            ))
          )}
        </div>
      </section>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  readOnly,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  readOnly: boolean
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-text-secondary mb-1">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        placeholder={placeholder}
        className={`w-full px-3 py-2 border rounded-md text-sm transition-colors ${
          readOnly
            ? 'bg-surface-sunken border-border-subtle text-text-secondary'
            : 'bg-surface border-border focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent'
        }`}
      />
    </label>
  )
}
