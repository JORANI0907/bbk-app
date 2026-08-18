'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'
import { GripVertical, Trash2, Plus, X } from 'lucide-react'

export interface DocumentTypeItem {
  id?: string
  value: string
  label: string
  hint?: string | null
  is_other: boolean
  is_active?: boolean
}

interface Props {
  initialTypes: DocumentTypeItem[]
  onSave: (types: DocumentTypeItem[]) => void
  onCancel: () => void
}

function makeValueFromLabel(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, '')
      .trim()
      .replace(/[\s-]+/g, '_')
      .slice(0, 40) || `custom_${Date.now()}`
  )
}

export function DocumentTypeEditor({ initialTypes, onSave, onCancel }: Props) {
  const [items, setItems] = useState<DocumentTypeItem[]>(() => initialTypes.map(t => ({ ...t })))
  const [saving, setSaving] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  const updateItem = (idx: number, patch: Partial<DocumentTypeItem>) => {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  const removeItem = (idx: number) => {
    if (items.length === 1) {
      toast.error('최소 1개 이상 필요합니다.')
      return
    }
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  const addItem = () => {
    const ts = Date.now()
    setItems(prev => [
      ...prev,
      {
        value: `custom_${ts}`,
        label: '',
        hint: '',
        is_other: false,
        is_active: true,
      },
    ])
  }

  // ─── HTML5 Native Drag & Drop ────────────────────────────────
  const handleDragStart = (idx: number) => (e: React.DragEvent) => {
    setDragIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleDragOver = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIdx(idx)
  }
  const handleDragEnd = () => {
    setDragIdx(null)
    setDragOverIdx(null)
  }
  const handleDrop = (targetIdx: number) => (e: React.DragEvent) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === targetIdx) {
      handleDragEnd()
      return
    }
    setItems(prev => {
      const next = [...prev]
      const [moved] = next.splice(dragIdx, 1)
      next.splice(targetIdx, 0, moved)
      return next
    })
    handleDragEnd()
  }

  const handleSave = async () => {
    // 검증
    for (const it of items) {
      if (!it.label.trim()) {
        toast.error('빈 라벨이 있습니다.')
        return
      }
    }
    // value 자동 채움 (라벨 기반 slug)
    const normalized = items.map(it => ({
      ...it,
      value: it.value?.trim() || makeValueFromLabel(it.label),
      label: it.label.trim(),
      hint: it.hint?.trim() || null,
    }))

    // value 중복 검사
    const seen = new Set<string>()
    for (const it of normalized) {
      if (seen.has(it.value)) {
        toast.error(`중복된 value: ${it.value}. 다른 이름으로 변경하세요.`)
        return
      }
      seen.add(it.value)
    }

    setSaving(true)
    try {
      const res = await fetch('/api/admin/worker-document-types', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ types: normalized }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '저장 실패')
      toast.success('서류 리스트가 저장됐습니다.')
      onSave(json.types ?? normalized)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-text-primary">서류 리스트 편집</p>
        <p className="text-[11px] text-text-tertiary">드래그로 순서 변경 · 모든 직원 공통</p>
      </div>

      <div className="space-y-2 border border-border-subtle rounded-xl p-3 bg-surface-sunken max-h-[45vh] overflow-y-auto">
        {items.map((it, idx) => {
          const isDragOver = dragOverIdx === idx && dragIdx !== null && dragIdx !== idx
          return (
            <div
              key={idx}
              draggable
              onDragStart={handleDragStart(idx)}
              onDragOver={handleDragOver(idx)}
              onDrop={handleDrop(idx)}
              onDragEnd={handleDragEnd}
              className={`flex items-start gap-2 bg-surface border rounded-lg p-2 ${
                isDragOver ? 'border-brand-500 ring-2 ring-brand-200' : 'border-border'
              } ${dragIdx === idx ? 'opacity-50' : ''}`}
            >
              <div className="cursor-grab active:cursor-grabbing p-1 text-text-tertiary hover:text-text-primary shrink-0 mt-1">
                <GripVertical size={16} />
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <input
                  value={it.label}
                  onChange={e => updateItem(idx, { label: e.target.value })}
                  placeholder="라벨 (예: 건설안전교육 이수증)"
                  className="w-full border border-border rounded-md px-2 py-1 text-sm font-medium bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
                <input
                  value={it.hint ?? ''}
                  onChange={e => updateItem(idx, { hint: e.target.value })}
                  placeholder="설명 (선택)"
                  className="w-full border border-border rounded-md px-2 py-1 text-xs bg-surface text-text-tertiary focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
                <label className="flex items-center gap-1.5 text-[11px] text-text-tertiary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={it.is_other}
                    onChange={e => updateItem(idx, { is_other: e.target.checked })}
                    className="w-3.5 h-3.5 accent-brand-600"
                  />
                  "기타" 항목 (사용자가 라벨 직접 입력)
                </label>
              </div>
              <button
                onClick={() => removeItem(idx)}
                className="p-1 text-text-tertiary hover:text-state-danger shrink-0"
                title="삭제"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )
        })}
      </div>

      <button
        onClick={addItem}
        className="w-full flex items-center justify-center gap-1 py-2 text-xs font-medium text-brand-700 border border-dashed border-brand-300 rounded-lg hover:bg-brand-50 transition-colors"
      >
        <Plus size={14} /> 항목 추가
      </button>

      <div className="flex gap-2 pt-2 border-t border-border-subtle">
        <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={saving}>
          <X size={14} className="mr-1" /> 취소
        </Button>
        <Button className="flex-1" onClick={handleSave} isLoading={saving}>
          저장
        </Button>
      </div>
    </div>
  )
}
