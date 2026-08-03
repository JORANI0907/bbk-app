'use client'

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { X, Save } from 'lucide-react'
import { DEFAULT_INSURANCE_RATES, type InsuranceRates } from './types'

interface Props {
  onClose: () => void
}

const RATE_FIELDS: { key: keyof InsuranceRates; label: string; hint: string }[] = [
  { key: 'nationalPension',   label: '국민연금',       hint: '기준 4.5%' },
  { key: 'healthInsurance',   label: '건강보험',       hint: '기준 3.545%' },
  { key: 'longtermCare',      label: '장기요양보험',   hint: '건강보험료의 % (기준 12.95%)' },
  { key: 'employmentInsurance', label: '고용보험',     hint: '기준 0.9%' },
  { key: 'residentTax',       label: '지방소득세',     hint: '소득세의 % (기준 10%)' },
]

export default function InsuranceRateModal({ onClose }: Props) {
  const [rates, setRates] = useState<InsuranceRates>(DEFAULT_INSURANCE_RATES)
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/admin/payroll/insurance-rates')
      .then(r => r.json())
      .then(data => {
        if (data.rates) {
          const r = data.rates as InsuranceRates
          setRates(r)
          const init: Record<string, string> = {}
          for (const { key } of RATE_FIELDS) {
            init[key] = String(+(r[key] * 100).toFixed(4))
          }
          setInputs(init)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleInputChange = (key: keyof InsuranceRates, value: string) => {
    setInputs(prev => ({ ...prev, [key]: value }))
    const num = parseFloat(value)
    if (!isNaN(num) && num >= 0 && num <= 100) {
      setRates(prev => ({ ...prev, [key]: num / 100 }))
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/payroll/insurance-rates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rates),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('보험 요율이 저장되었습니다.')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <div>
            <h2 className="text-base font-bold text-text-primary">보험 요율 설정</h2>
            <p className="text-xs text-text-tertiary mt-0.5">변경하면 전 직원에게 동일하게 적용됩니다</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-surface-sunken transition">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {loading ? (
            <p className="text-sm text-text-tertiary text-center py-6">불러오는 중...</p>
          ) : (
            RATE_FIELDS.map(({ key, label, hint }) => (
              <div key={key}>
                <label className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-text-secondary">{label}</span>
                  <span className="text-[10px] text-text-tertiary">{hint}</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    max="100"
                    value={inputs[key] ?? ''}
                    onChange={e => handleInputChange(key, e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary text-sm font-medium">%</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-5 pb-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm font-semibold rounded-lg border border-border text-text-secondary hover:bg-surface-sunken transition"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex-1 py-2.5 text-sm font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition disabled:opacity-60 flex items-center justify-center gap-1.5"
          >
            <Save size={14} />
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
