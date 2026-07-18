'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ExternalLink, Trash2, Pencil, Check, X, Loader2, Calendar } from 'lucide-react'
import type { ShoppingItem, ShoppingPriority } from '@/lib/shopping-types'
import { PRIORITY_CONFIG, DEFAULT_CATEGORIES } from '@/lib/shopping-types'
import { markPurchased, updateShoppingItem, deleteShoppingItem } from '@/lib/shopping-api'

interface Props {
  item: ShoppingItem
  knownCategories: string[]
  onUpdated: (item: ShoppingItem) => void
  onDeleted: (id: string) => void
}

export function ShoppingItemCard({ item, knownCategories, onUpdated, onDeleted }: Props) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [draft, setDraft] = useState({
    title: item.title,
    category: item.category ?? '',
    priority: item.priority,
    qty: item.qty,
    url: item.url ?? '',
    memo: item.memo ?? '',
  })

  const prioCfg = PRIORITY_CONFIG[item.priority]
  const isPurchased = item.status === 'purchased'
  const categories = [...new Set([...DEFAULT_CATEGORIES, ...knownCategories])]

  async function handleToggle() {
    setToggling(true)
    try { onUpdated(await markPurchased(item.id, !isPurchased)) }
    catch { /* ignore */ } finally { setToggling(false) }
  }

  async function handleSave() {
    if (!draft.title.trim()) return
    setSaving(true)
    try {
      const updated = await updateShoppingItem(item.id, {
        title: draft.title.trim(),
        category: draft.category || null,
        priority: draft.priority,
        qty: draft.qty || 1,
        url: draft.url.trim() || null,
        memo: draft.memo.trim() || null,
      })
      onUpdated(updated)
      setEditing(false)
    } catch { /* ignore */ } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!confirm(`"${item.title}" 삭제할까요?`)) return
    try { await deleteShoppingItem(item.id); onDeleted(item.id) } catch { /* ignore */ }
  }

  if (editing) {
    return (
      <div className="bg-white border-2 border-blue-300 rounded-xl p-3.5 shadow-sm flex flex-col gap-2">
        <input
          autoFocus
          value={draft.title}
          onChange={e => setDraft({ ...draft, title: e.target.value })}
          className="px-2.5 py-1.5 text-sm font-semibold border border-gray-200 rounded-lg outline-none focus:border-blue-400"
        />
        <div className="flex flex-wrap gap-1.5">
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setDraft({ ...draft, category: draft.category === c ? '' : c })}
              className={`px-2 py-0.5 rounded-full text-[10px] border ${
                draft.category === c ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {(['urgent', 'normal', 'later'] as ShoppingPriority[]).map(p => {
            const cfg = PRIORITY_CONFIG[p]
            const active = draft.priority === p
            return (
              <button
                key={p}
                onClick={() => setDraft({ ...draft, priority: p })}
                className="flex-1 py-1 rounded-lg text-[11px] font-medium border"
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
        <div className="flex gap-1.5">
          <input
            type="number"
            min={1}
            value={draft.qty}
            onChange={e => setDraft({ ...draft, qty: parseInt(e.target.value) || 1 })}
            placeholder="수량"
            className="w-16 px-2 py-1 text-xs border border-gray-200 rounded-lg outline-none"
          />
          <input
            type="url"
            value={draft.url}
            onChange={e => setDraft({ ...draft, url: e.target.value })}
            placeholder="링크 URL"
            className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-lg outline-none"
          />
        </div>
        <textarea
          value={draft.memo}
          onChange={e => setDraft({ ...draft, memo: e.target.value })}
          rows={2}
          placeholder="메모"
          className="px-2 py-1 text-xs border border-gray-200 rounded-lg outline-none resize-none"
        />
        <div className="flex gap-1.5 justify-end">
          <button
            onClick={handleDelete}
            className="px-2.5 py-1 text-[11px] rounded-lg border border-red-300 text-red-500 hover:bg-red-50 flex items-center gap-1"
          >
            <Trash2 size={10} /> 삭제
          </button>
          <button
            onClick={() => setEditing(false)}
            className="px-2.5 py-1 text-[11px] rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !draft.title.trim()}
            className="px-2.5 py-1 text-[11px] rounded-lg bg-blue-500 text-white font-semibold hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1"
          >
            {saving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} 저장
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`bg-white border rounded-xl p-3 shadow-sm transition-all flex items-start gap-2.5 ${
        isPurchased ? 'opacity-60 border-gray-200' : 'border-gray-200 hover:border-blue-200'
      }`}
    >
      {/* 체크박스 */}
      <button
        onClick={handleToggle}
        disabled={toggling}
        className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
          isPurchased
            ? 'bg-green-500 border-green-500 text-white'
            : 'bg-white border-gray-300 hover:border-blue-400'
        }`}
      >
        {toggling ? <Loader2 size={10} className="animate-spin" /> : isPurchased && <Check size={12} strokeWidth={3} />}
      </button>

      {/* 본문 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`text-sm font-semibold ${isPurchased ? 'text-gray-400 line-through' : 'text-gray-900'}`}
          >
            {item.title}
          </span>
          {item.qty > 1 && (
            <span className="text-[10px] text-gray-400">×{item.qty}</span>
          )}
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: prioCfg.bg, color: prioCfg.color }}
          >
            {prioCfg.label}
          </span>
          {item.category && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {item.category}
            </span>
          )}
        </div>
        {item.url && (
          <div className="mt-0.5">
            <Link href={item.url} target="_blank" rel="noopener" className="text-[11px] text-blue-500 hover:underline inline-flex items-center gap-0.5">
              <ExternalLink size={9} /> 링크
            </Link>
          </div>
        )}
        {item.service_date && (
          <p className="text-[11px] text-orange-500 mt-1 font-medium inline-flex items-center gap-1"><Calendar size={14} /> 시공일자: {item.service_date}</p>
        )}
        {item.memo && (
          <p className="text-[11px] text-gray-500 mt-1 whitespace-pre-wrap line-clamp-2">{item.memo}</p>
        )}
      </div>

      {/* 액션 */}
      <div className="flex flex-col gap-1 shrink-0">
        <button
          onClick={() => setEditing(true)}
          className="w-7 h-7 rounded-md hover:bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-700"
          title="수정"
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={handleDelete}
          className="w-7 h-7 rounded-md hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500"
          title="삭제"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
