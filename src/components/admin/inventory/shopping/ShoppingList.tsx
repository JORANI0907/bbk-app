'use client'

import { useState, useEffect, useMemo } from 'react'
import { Search, Loader2 } from 'lucide-react'
import type { ShoppingItem, ShoppingPriority } from '@/lib/shopping-types'
import { PRIORITY_CONFIG, DEFAULT_CATEGORIES } from '@/lib/shopping-types'
import { getShoppingItems, getKnownCategories } from '@/lib/shopping-api'
import { AddItemForm } from './AddItemForm'
import { ShoppingItemCard } from './ShoppingItemCard'
import { SitesList } from './SitesList'

const PRIORITY_ORDER: Record<ShoppingPriority, number> = { urgent: 0, normal: 1, later: 2 }

type Tab = 'pending' | 'purchased' | 'sites'

export function ShoppingList() {
  const [tab, setTab] = useState<Tab>('pending')
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [knownCategories, setKnownCategories] = useState<string[]>([])
  const [newlyAddedCategories, setNewlyAddedCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
  const [filterPriority, setFilterPriority] = useState<ShoppingPriority | null>(null)

  useEffect(() => {
    if (tab === 'sites') return
    setLoading(true)
    Promise.all([getShoppingItems(tab), getKnownCategories()])
      .then(([list, cats]) => { setItems(list); setKnownCategories(cats) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [tab])

  const allCategories = useMemo(
    () => [...new Set([...DEFAULT_CATEGORIES, ...knownCategories, ...newlyAddedCategories])],
    [knownCategories, newlyAddedCategories]
  )

  const filtered = useMemo(() => {
    return items
      .filter(item => {
        if (search && !item.title.toLowerCase().includes(search.toLowerCase())) return false
        if (filterCategory && item.category !== filterCategory) return false
        if (filterPriority && item.priority !== filterPriority) return false
        return true
      })
      .sort((a, b) => {
        if (tab === 'pending') {
          const ap = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
          if (ap !== 0) return ap
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
  }, [items, search, filterCategory, filterPriority, tab])

  const pendingCount = tab === 'pending'
    ? items.length
    : items.filter(i => i.status === 'pending').length

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-4 p-4">
      {/* 서브 탭 */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setTab('pending')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            tab === 'pending'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          구입 예정 {tab === 'pending' && <span className="text-[10px] ml-1 text-gray-400">({pendingCount})</span>}
        </button>
        <button
          onClick={() => setTab('purchased')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            tab === 'purchased'
              ? 'border-green-500 text-green-600'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          구입 완료
        </button>
        <button
          onClick={() => setTab('sites')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            tab === 'sites'
              ? 'border-indigo-500 text-indigo-600'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          구입 사이트
        </button>
      </div>

      {tab === 'sites' ? <SitesList /> : (
      <>

      {/* 검색/필터 */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="품목 검색"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilterCategory(null)}
            className={`px-2.5 py-1 rounded-full text-xs border ${
              filterCategory === null ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200'
            }`}
          >
            전체
          </button>
          {allCategories.map(c => (
            <button
              key={c}
              onClick={() => setFilterCategory(filterCategory === c ? null : c)}
              className={`px-2.5 py-1 rounded-full text-xs border ${
                filterCategory === c ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        {tab === 'pending' && (
          <div className="flex gap-1.5">
            {(['urgent', 'normal', 'later'] as ShoppingPriority[]).map(p => {
              const cfg = PRIORITY_CONFIG[p]
              const active = filterPriority === p
              return (
                <button
                  key={p}
                  onClick={() => setFilterPriority(active ? null : p)}
                  className="px-2.5 py-1 rounded-full text-xs border transition-colors"
                  style={{
                    borderColor: active ? cfg.color : '#e5e7eb',
                    backgroundColor: active ? cfg.bg : '#fff',
                    color: active ? cfg.color : '#6b7280',
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {cfg.label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* 추가 폼 */}
      {tab === 'pending' && (
        <AddItemForm
          knownCategories={allCategories}
          onCreated={item => setItems(p => [item, ...p])}
          onCategoryAdded={name => setNewlyAddedCategories(p => p.includes(name) ? p : [...p, name])}
        />
      )}

      {/* 리스트 */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400 text-sm gap-2">
          <Loader2 size={14} className="animate-spin" /> 불러오는 중...
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-gray-400 text-sm">
          {tab === 'pending' ? '구입 예정 품목이 없습니다' : '구입 완료 기록이 없습니다'}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(item => (
            <ShoppingItemCard
              key={item.id}
              item={item}
              knownCategories={allCategories}
              onUpdated={updated => {
                // 상태 변경 시 현재 탭에서 제거, 아니면 교체
                setItems(p => {
                  if (updated.status !== tab) return p.filter(i => i.id !== updated.id)
                  return p.map(i => i.id === updated.id ? updated : i)
                })
              }}
              onDeleted={id => setItems(p => p.filter(i => i.id !== id))}
            />
          ))}
        </div>
      )}

      </>
      )}
    </div>
  )
}
