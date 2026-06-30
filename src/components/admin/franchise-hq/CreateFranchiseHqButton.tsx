'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { LogoUploader } from './LogoUploader'

export function CreateFranchiseHqButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    brandName: '',
    logoUrl: '',
    managerName: '',
    managerPhone: '',
  })

  const update = (key: keyof typeof form, value: string) => {
    setForm((s) => ({ ...s, [key]: value }))
  }

  const handleSubmit = async () => {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/franchise-hq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '등록 실패')
      toast.success('본사 정보가 등록되었습니다. 계정은 회원관리에서 발급해주세요.')
      setOpen(false)
      setForm({ brandName: '', logoUrl: '', managerName: '', managerPhone: '' })
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '등록 실패')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 active:scale-[0.98] transition-all shadow-soft"
      >
        + 본사 등록
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-surface rounded-2xl shadow-modal max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-text-primary mb-1">신규 본사 등록</h2>
            <p className="text-xs text-text-tertiary mb-4 break-keep">
              본사 정보만 등록합니다. 계정 발급은 회원관리에서 진행하세요.
            </p>

            <div className="flex flex-col gap-3">
              <Field label="브랜드명 *" value={form.brandName} onChange={(v) => update('brandName', v)} placeholder="예: 깔끔치킨" />
              <LogoUploader value={form.logoUrl} onChange={(v) => update('logoUrl', v)} disabled={loading} />
              <Field label="담당자명 (선택)" value={form.managerName} onChange={(v) => update('managerName', v)} placeholder="홍길동" />
              <Field label="연락처 (선택)" value={form.managerPhone} onChange={(v) => update('managerPhone', v)} placeholder="01012345678" />
            </div>

            <div className="flex items-center justify-end gap-2 mt-6">
              <button
                onClick={() => setOpen(false)}
                disabled={loading}
                className="px-4 py-2 text-sm font-semibold text-text-secondary hover:bg-surface-sunken rounded-lg"
              >
                취소
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50"
              >
                {loading ? '등록 중...' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-text-secondary mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-border rounded-md text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
      />
    </label>
  )
}
