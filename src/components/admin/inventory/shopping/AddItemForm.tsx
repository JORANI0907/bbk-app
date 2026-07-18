'use client'

import { useState } from 'react'
import { Plus, Loader2, X } from 'lucide-react'
import type { ShoppingItem, ShoppingPriority } from '@/lib/shopping-types'
import { DEFAULT_CATEGORIES, PRIORITY_CONFIG } from '@/lib/shopping-types'
import { createShoppingItem } from '@/lib/shopping-api'

interface Props {
  knownCategories: string[]
  onCreated: (item: ShoppingItem) => void
  onCategoryAdded: (name: string) => void
}

export function AddItemForm({ knownCategories, onCreated, onCategoryAdded }: Props) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<string>('')
  const [newCategory, setNewCategory] = useState('')
  const [addingCategory, setAddingCategory] = useState(false)
  const [priority, setPriority] = useState<ShoppingPriority>('normal')
  const [qty, setQty] = useState<number>(1)
  const [url, setUrl] = useState('')
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)

  const categories = [...new Set([...DEFAULT_CATEGORIES, ...knownCategories])]

  function reset() {
    setTitle(''); setCategory(''); setPriority('normal'); setQty(1)
    setUrl(''); setMemo('')
    setNewCategory(''); setAddingCategory(false)
  }

  function confirmNewCategory() {
    const name = newCategory.trim()
    if (!name) { setAddingCategory(false); return }
    setCategory(name)
    onCategoryAdded(name)
    setAddingCategory(false)
    setNewCategory('')
  }

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    try {
      const item = await createShoppingItem({
        title: title.trim(),
        category: category || null,
        priority,
        qty: qty || 1,
        url: url.trim() || null,
        memo: memo.trim() || null,
        status: 'pending',
      })
      onCreated(item)
      reset()
      setOpen(false)
    } catch { /* ignore */ } finally { setSaving(false) }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 transition-colors text-sm font-medium"
      >
        <Plus size={16} /> 새 품목 추가
      </button>
    )
  }

  return (
    <div className="bg-white border border-blue-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-gray-900">새 품목 추가</h3>
        <button onClick={() => { reset(); setOpen(false) }} className="text-gray-400 hover:text-gray-600">
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-col gap-2.5">
        <input
          autoFocus
          placeholder="품목명 *"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && title.trim()) handleSave() }}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-blue-400 outline-none"
        />

        {/* 카테고리 */}
        <div>
          <div className="text-xs text-gray-500 mb-1.5">카테고리</div>
          <div className="flex flex-wrap gap-1.5">
            {categories.map(c => (
              <button
                key={c}
                onClick={() => setCategory(category === c ? '' : c)}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                  category === c ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                }`}
              >
                {c}
              </button>
            ))}
            {addingCategory ? (
              <span className="inline-flex items-center gap-1">
                <input
                  autoFocus
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') confirmNewCategory()
                    if (e.key === 'Escape') { setAddingCategory(false); setNewCategory('') }
                  }}
                  placeholder="새 카테고리"
                  className="px-2 py-0.5 text-xs border border-blue-300 rounded-full outline-none w-24"
                />
                <button onClick={confirmNewCategory} className="text-xs text-blue-600 font-semibold">확인</button>
              </span>
            ) : (
              <button
                onClick={() => setAddingCategory(true)}
                className="px-2.5 py-1 rounded-full text-xs border border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600"
              >
                + 추가
              </button>
            )}
          </div>
        </div>

        {/* 우선순위 */}
        <div>
          <div className="text-xs text-gray-500 mb-1.5">우선순위</div>
          <div className="flex gap-1.5">
            {(['urgent', 'normal', 'later'] as ShoppingPriority[]).map(p => {
              const cfg = PRIORITY_CONFIG[p]
              const active = priority === p
              return (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className="flex-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors"
                  style={{
                    borderColor: active ? cfg.color : '#e5e7eb',
                    backgroundColor: active ? cfg.bg : '#fff',
                    color: active ? cfg.color : '#6b7280',
                  }}
                >
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* 수량 */}
        <label>
          <div className="text-xs text-gray-500 mb-1.5">수량</div>
          <input
            type="number"
            min={1}
            value={qty}
            onChange={e => setQty(parseInt(e.target.value) || 1)}
            className="w-24 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400"
          />
        </label>

        {/* URL */}
        <label>
          <div className="text-xs text-gray-500 mb-1.5">상품 링크</div>
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://..."
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400"
          />
        </label>
        <label>
          <div className="text-xs text-gray-500 mb-1.5">메모</div>
          <textarea
            value={memo}
            onChange={e => setMemo(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400 resize-none"
          />
        </label>

        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={() => { reset(); setOpen(false) }}
            className="px-4 py-2 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="px-4 py-2 text-xs rounded-lg bg-blue-500 text-white font-semibold hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            추가
          </button>
        </div>
      </div>
    </div>
  )
}
