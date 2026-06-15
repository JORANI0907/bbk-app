'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Plus, Trash2, ChevronLeft, Save, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui'
import toast from 'react-hot-toast'
import type { CareManualSection, CareManualItem } from '@/types/care-manual'

const EMPTY_ITEM: CareManualItem = { label: '', desc: '' }
const EMPTY_SECTION: CareManualSection = { section: '', items: [{ ...EMPTY_ITEM }] }

export default function CareManualEditPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [sections, setSections] = useState<CareManualSection[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [customerName, setCustomerName] = useState('')

  const fetchManual = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/admin/customers/${id}/care-manual`)
      const data = await res.json()
      setSections(data.sections ?? [])
      setCustomerName(data.business_name ?? '')
    } catch {
      toast.error('불러오기 실패')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchManual() }, [fetchManual])

  const handleSave = async () => {
    try {
      setSaving(true)
      const res = await fetch(`/api/admin/customers/${id}/care-manual`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections }),
      })
      if (!res.ok) throw new Error()
      toast.success('케어매뉴얼 저장됨')
    } catch {
      toast.error('저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const updateSection = (si: number, key: keyof CareManualSection, value: string) =>
    setSections(prev => prev.map((s, i) => i === si ? { ...s, [key]: value } : s))

  const addSection = () =>
    setSections(prev => [...prev, { ...EMPTY_SECTION, items: [{ ...EMPTY_ITEM }] }])

  const removeSection = (si: number) =>
    setSections(prev => prev.filter((_, i) => i !== si))

  const updateItem = (si: number, ii: number, key: keyof CareManualItem, value: string) =>
    setSections(prev => prev.map((s, i) =>
      i !== si ? s : {
        ...s,
        items: s.items.map((item, j) => j === ii ? { ...item, [key]: value } : item)
      }
    ))

  const addItem = (si: number) =>
    setSections(prev => prev.map((s, i) =>
      i !== si ? s : { ...s, items: [...s.items, { ...EMPTY_ITEM }] }
    ))

  const removeItem = (si: number, ii: number) =>
    setSections(prev => prev.map((s, i) =>
      i !== si ? s : { ...s, items: s.items.filter((_, j) => j !== ii) }
    ))

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-text-tertiary text-sm">불러오는 중...</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-4">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-surface-sunken">
          <ChevronLeft size={20} className="text-text-secondary" />
        </button>
        <div className="flex-1">
          <p className="text-xs text-text-tertiary">케어매뉴얼 편집</p>
          <h1 className="text-base font-bold text-text-primary break-keep">
            {customerName || '고객'}
          </h1>
        </div>
        <Button onClick={handleSave} disabled={saving} size="sm">
          <Save size={14} className="mr-1" />
          {saving ? '저장 중...' : '저장'}
        </Button>
      </div>

      {/* 섹션 목록 */}
      {sections.length === 0 && (
        <div className="bg-surface-sunken rounded-2xl p-8 text-center">
          <p className="text-text-tertiary text-sm">케어매뉴얼이 없습니다.</p>
          <p className="text-text-tertiary text-xs mt-1">아래 버튼으로 섹션을 추가하세요.</p>
        </div>
      )}

      {sections.map((section, si) => (
        <div key={si} className="bg-surface rounded-2xl border border-border-subtle shadow-soft overflow-hidden">
          {/* 섹션 헤더 */}
          <div className="flex items-center gap-2 px-4 py-3 bg-surface-sunken border-b border-border-subtle">
            <GripVertical size={16} className="text-text-tertiary shrink-0" />
            <input
              value={section.section}
              onChange={e => updateSection(si, 'section', e.target.value)}
              placeholder="섹션명 (예: 주방 후드)"
              className="flex-1 text-sm font-semibold bg-transparent outline-none text-text-primary placeholder:text-text-tertiary"
            />
            <button
              onClick={() => removeSection(si)}
              className="p-1 rounded-lg hover:bg-state-danger-bg text-text-tertiary hover:text-state-danger transition-colors"
            >
              <Trash2 size={15} />
            </button>
          </div>

          {/* 항목 목록 */}
          <div className="divide-y divide-border-subtle">
            {section.items.map((item, ii) => (
              <div key={ii} className="px-4 py-3 flex gap-3 items-start">
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <input
                    value={item.label}
                    onChange={e => updateItem(si, ii, 'label', e.target.value)}
                    placeholder="항목명"
                    className="text-sm bg-surface-sunken rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-brand-600 text-text-primary placeholder:text-text-tertiary"
                  />
                  <input
                    value={item.desc}
                    onChange={e => updateItem(si, ii, 'desc', e.target.value)}
                    placeholder="설명"
                    className="text-sm bg-surface-sunken rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-brand-600 text-text-primary placeholder:text-text-tertiary"
                  />
                </div>
                <button
                  onClick={() => removeItem(si, ii)}
                  className="p-1.5 mt-1 rounded-lg hover:bg-state-danger-bg text-text-tertiary hover:text-state-danger transition-colors shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          {/* 항목 추가 */}
          <div className="px-4 py-2 border-t border-border-subtle">
            <button
              onClick={() => addItem(si)}
              className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium py-1"
            >
              <Plus size={13} /> 항목 추가
            </button>
          </div>
        </div>
      ))}

      {/* 섹션 추가 */}
      <button
        onClick={addSection}
        className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl border-2 border-dashed border-border text-text-secondary hover:border-brand-600 hover:text-brand-600 transition-colors text-sm font-medium"
      >
        <Plus size={16} /> 섹션 추가
      </button>

      {/* 저장 (하단 고정) */}
      <Button onClick={handleSave} disabled={saving} size="lg" className="w-full">
        <Save size={16} className="mr-2" />
        {saving ? '저장 중...' : '케어매뉴얼 저장'}
      </Button>
    </div>
  )
}
