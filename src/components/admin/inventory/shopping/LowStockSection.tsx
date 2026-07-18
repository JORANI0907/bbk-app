'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'

export interface LowStockItemLite {
  id: string
  item_name: string
  category: 'chemical' | 'equipment' | 'consumable' | 'other'
  current_qty: number
  unit: string | null
  min_qty: number
}

const CATEGORY_ORDER = ['chemical', 'equipment', 'consumable', 'other'] as const
type CategoryKey = (typeof CATEGORY_ORDER)[number] | 'all'

const CATEGORY_LABEL: Record<string, string> = {
  all:        '전체',
  chemical:   '약품',
  equipment:  '장비',
  consumable: '소모품',
  other:      '기타',
}

const CATEGORY_DOT: Record<string, string> = {
  chemical:   'bg-purple-500',
  equipment:  'bg-blue-500',
  consumable: 'bg-green-500',
  other:      'bg-gray-400',
}

function fmtQty(qty: number, unit: string | null): string {
  const q = Number.isInteger(qty) ? qty.toString() : qty.toFixed(1)
  return unit ? `${q}${unit}` : q
}

interface Props {
  items: LowStockItemLite[]
}

export function LowStockSection({ items }: Props) {
  const [expanded, setExpanded] = useState(true)
  const [filter, setFilter] = useState<CategoryKey>('all')

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: items.length }
    for (const c of CATEGORY_ORDER) map[c] = 0
    for (const it of items) {
      map[it.category] = (map[it.category] ?? 0) + 1
    }
    return map
  }, [items])

  const filtered = useMemo(() => {
    if (filter === 'all') return items
    return items.filter(it => it.category === filter)
  }, [items, filter])

  const zeroCount = items.filter(i => Number(i.current_qty) === 0).length

  return (
    <div className="border-2 border-red-200 rounded-xl overflow-hidden bg-red-50/40">
      {/* 헤더 */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-red-50 transition-colors text-left"
      >
        {expanded
          ? <ChevronDown size={14} className="text-red-500 shrink-0" />
          : <ChevronRight size={14} className="text-red-500 shrink-0" />}
        <AlertTriangle size={16} className="text-red-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-red-900">재고 부족 품목</span>
            <span className="text-[10px] font-semibold bg-red-500 text-white px-1.5 py-0.5 rounded-full">
              {items.length}건
            </span>
            {zeroCount > 0 && (
              <span className="text-[10px] font-semibold bg-gray-800 text-white px-1.5 py-0.5 rounded-full">
                품절 {zeroCount}
              </span>
            )}
          </div>
          <p className="text-[11px] text-red-600 mt-0.5">품목별 알림 기준 수량 이하 (재고 현황 연동)</p>
        </div>
      </button>

      {expanded && (
        <>
          {/* 카테고리 필터 */}
          <div className="border-t border-red-200 bg-white/60 px-3 py-2 flex flex-wrap gap-1.5">
            {(['all', ...CATEGORY_ORDER] as CategoryKey[]).map(key => {
              const active = filter === key
              const count = counts[key] ?? 0
              const disabled = key !== 'all' && count === 0
              return (
                <button
                  key={key}
                  onClick={() => !disabled && setFilter(key)}
                  disabled={disabled}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors flex items-center gap-1 ${
                    active
                      ? 'bg-red-500 text-white border-red-500'
                      : disabled
                        ? 'bg-white/40 text-gray-300 border-gray-200 cursor-not-allowed'
                        : 'bg-white text-red-700 border-red-200 hover:border-red-400'
                  }`}
                >
                  {CATEGORY_LABEL[key]}
                  <span className={`text-[10px] font-semibold ${active ? 'text-red-100' : 'text-gray-400'}`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* 품목 리스트 */}
          <div className="border-t border-red-200 bg-white max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-xs text-gray-400">
                {items.length === 0 ? '✓ 재고 부족 품목 없음' : '해당 카테고리에 부족 품목 없음'}
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {filtered.map(item => {
                  const qty = Number(item.current_qty)
                  const minQty = Number(item.min_qty ?? 0)
                  const isZero = qty === 0
                  return (
                    <li key={item.id} className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0 bg-red-500" />
                        <span className="flex-1 text-sm font-medium text-gray-900 truncate">{item.item_name}</span>
                        {isZero && (
                          <span className="text-[10px] font-bold bg-gray-800 text-white px-1.5 py-0.5 rounded-full shrink-0">품절</span>
                        )}
                        <span className={`shrink-0 text-xs font-bold ${isZero ? 'text-gray-800' : 'text-red-600'}`}>
                          {isZero ? '0' : fmtQty(qty, item.unit)}
                        </span>
                      </div>
                      <div className="ml-4 flex items-center justify-between mt-0.5">
                        <span className="text-[10px] text-gray-400 flex items-center gap-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${CATEGORY_DOT[item.category]}`} />
                          {CATEGORY_LABEL[item.category]}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          기준 {fmtQty(minQty, item.unit)} 이하
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
