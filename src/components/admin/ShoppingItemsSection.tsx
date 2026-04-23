'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, X, Plus } from 'lucide-react'
import toast from 'react-hot-toast'

// ─── 타입 정의 ──────────────────────────────────────────────────
type ShoppingCategory = '업무' | '생활용품' | '전자' | '식료품' | '의류' | '기타'
type ShoppingPriority = 'urgent' | 'normal' | 'later'

interface SavedItem {
  id: string
  title: string
  category: string
  priority: string
  qty: number
  expected_price?: number | null
  where_to_buy?: string | null
  url?: string | null
  memo?: string | null
  status: string
  created_at: string
}

interface DraftItem {
  localId: string
  title: string
  category: ShoppingCategory
  priority: ShoppingPriority
  qty: number
  expected_price?: number
  where_to_buy?: string
  url?: string
  memo: string
  expanded: boolean
}

// ─── Props ───────────────────────────────────────────────────────
interface ShoppingItemsSectionProps {
  applicationId: string
  businessName: string
  serviceType: string | null
  constructionDate: string | null
}

// ─── 상수 ────────────────────────────────────────────────────────
const CATEGORY_OPTIONS: { value: ShoppingCategory; label: string }[] = [
  { value: '업무', label: '업무' },
  { value: '생활용품', label: '생활용품' },
  { value: '전자', label: '전자' },
  { value: '식료품', label: '식료품' },
  { value: '의류', label: '의류' },
  { value: '기타', label: '기타' },
]

const PRIORITY_OPTIONS: { value: ShoppingPriority; label: string }[] = [
  { value: 'urgent', label: '긴급' },
  { value: 'normal', label: '보통' },
  { value: 'later', label: '나중에' },
]

// ─── 로컬 섹션 래퍼 ──────────────────────────────────────────────
function SectionWrapper({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
      {children}
    </div>
  )
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────
export function ShoppingItemsSection({
  applicationId,
  businessName,
  serviceType,
  constructionDate,
}: ShoppingItemsSectionProps) {
  const [items, setItems] = useState<DraftItem[]>([])
  const [saving, setSaving] = useState(false)
  const [savedItems, setSavedItems] = useState<SavedItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!applicationId) return
    setLoading(true)
    fetch(`/api/admin/shopping-items?applicationId=${applicationId}`)
      .then(r => r.json())
      .then(data => setSavedItems((data as { items?: SavedItem[] }).items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [applicationId])

  const buildMemo = () =>
    `[BBK 서비스 연동] 업체명: ${businessName} / 서비스: ${serviceType ?? '미지정'} / 신청서ID: ${applicationId}`

  // ─── 항목 추가 ────────────────────────────────────────────────
  const addItem = () => {
    setItems(prev => [
      ...prev,
      {
        localId: Date.now().toString(),
        title: '',
        category: '기타',
        priority: 'normal',
        qty: 1,
        memo: buildMemo(),
        expanded: false,
      },
    ])
  }

  // ─── 항목 필드 업데이트 (불변성 유지) ─────────────────────────
  const updateItem = (localId: string, patch: Partial<DraftItem>) => {
    setItems(prev =>
      prev.map(item => (item.localId === localId ? { ...item, ...patch } : item))
    )
  }

  // ─── 아코디언 토글 ────────────────────────────────────────────
  const toggleExpand = (localId: string) => {
    const current = items.find(i => i.localId === localId)
    updateItem(localId, { expanded: !current?.expanded })
  }

  // ─── 항목 삭제 ────────────────────────────────────────────────
  const removeItem = (localId: string) => {
    setItems(prev => prev.filter(i => i.localId !== localId))
  }

  // ─── 저장 ─────────────────────────────────────────────────────
  const handleSave = async () => {
    const validItems = items.filter(i => i.title.trim() !== '')
    if (validItems.length === 0) {
      toast.error('물건명을 입력해주세요')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/shopping-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId,
          businessName,
          serviceType,
          constructionDate: constructionDate ?? null,
          items: validItems.map(({ localId, expanded, ...rest }) => rest),
        }),
      })
      if (!res.ok) throw new Error('저장 실패')
      toast.success(`${validItems.length}개 항목이 구매 리스트에 추가되었습니다`)
      setItems([])
      // 저장 후 목록 새로고침
      const refreshRes = await fetch(`/api/admin/shopping-items?applicationId=${applicationId}`)
      const refreshData = await refreshRes.json() as { items?: SavedItem[] }
      setSavedItems(refreshData.items ?? [])
    } catch {
      toast.error('저장 중 오류가 발생했습니다')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionWrapper title="필요한 물건">
      {/* ─── 저장된 항목 ─── */}
      {loading && <p className="text-xs text-gray-400 mb-2">불러오는 중...</p>}
      {savedItems.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-xs font-medium text-gray-500">저장된 항목 ({savedItems.length})</p>
          {savedItems.map(item => (
            <div key={item.id} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs">
              <span className="flex-1 font-medium text-gray-800">{item.title}</span>
              <span className="text-gray-400">{item.category}</span>
              <span className={`px-1.5 py-0.5 rounded text-white text-[10px] ${
                item.priority === 'urgent' ? 'bg-red-500' :
                item.priority === 'normal' ? 'bg-blue-500' : 'bg-gray-400'
              }`}>
                {item.priority === 'urgent' ? '긴급' : item.priority === 'normal' ? '보통' : '나중에'}
              </span>
              <span className="text-gray-400">×{item.qty}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                item.status === 'purchased' ? 'bg-green-100 text-green-700' :
                item.status === 'canceled' ? 'bg-red-100 text-red-700' :
                'bg-gray-100 text-gray-600'
              }`}>
                {item.status === 'purchased' ? '구매완료' : item.status === 'canceled' ? '취소' : '대기중'}
              </span>
            </div>
          ))}
        </div>
      )}
      {savedItems.length > 0 && (
        <div className="border-t border-dashed border-gray-200 my-3" />
      )}

      <div className="space-y-2">
        {/* ─── 항목 없을 때 안내 ─── */}
        {items.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-3">
            아직 추가된 항목이 없습니다
          </p>
        )}

        {/* ─── 항목 카드 리스트 ─── */}
        {items.map(item => (
          <div
            key={item.localId}
            className="bg-gray-50 border border-gray-200 rounded-lg p-3"
          >
            {/* 항상 표시: 물건명 + 아코디언 토글 + 삭제 */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={item.title}
                onChange={e => updateItem(item.localId, { title: e.target.value })}
                placeholder="물건명 입력"
                className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900
                  bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => toggleExpand(item.localId)}
                aria-label={item.expanded ? '상세 닫기' : '상세 열기'}
                className={`p-1 rounded transition-colors ${
                  item.expanded
                    ? 'text-blue-500 hover:bg-blue-50'
                    : 'text-gray-400 hover:bg-gray-200'
                }`}
              >
                {item.expanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
              <button
                type="button"
                onClick={() => removeItem(item.localId)}
                aria-label="항목 삭제"
                className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 아코디언 열렸을 때만 표시 */}
            {item.expanded && (
              <div className="mt-3 space-y-2">
                {/* 카테고리 + 우선순위 */}
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 block mb-1">카테고리</label>
                    <select
                      value={item.category}
                      onChange={e =>
                        updateItem(item.localId, {
                          category: e.target.value as ShoppingCategory,
                        })
                      }
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white
                        focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {CATEGORY_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 block mb-1">우선순위</label>
                    <select
                      value={item.priority}
                      onChange={e =>
                        updateItem(item.localId, {
                          priority: e.target.value as ShoppingPriority,
                        })
                      }
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white
                        focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {PRIORITY_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 수량 + 예상가격 */}
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 block mb-1">수량</label>
                    <input
                      type="number"
                      min={1}
                      value={item.qty}
                      onChange={e =>
                        updateItem(item.localId, {
                          qty: Math.max(1, parseInt(e.target.value) || 1),
                        })
                      }
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900
                        bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 block mb-1">예상가격 (원)</label>
                    <input
                      type="number"
                      min={0}
                      value={item.expected_price ?? ''}
                      placeholder="0"
                      onChange={e =>
                        updateItem(item.localId, {
                          expected_price: e.target.value
                            ? parseInt(e.target.value)
                            : undefined,
                        })
                      }
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900
                        bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* 구매처 + URL */}
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 block mb-1">구매처</label>
                    <input
                      type="text"
                      value={item.where_to_buy ?? ''}
                      placeholder="예: 쿠팡, 다이소"
                      onChange={e =>
                        updateItem(item.localId, { where_to_buy: e.target.value })
                      }
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900
                        bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 block mb-1">URL</label>
                    <input
                      type="text"
                      value={item.url ?? ''}
                      placeholder="https://"
                      onChange={e =>
                        updateItem(item.localId, { url: e.target.value })
                      }
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900
                        bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* 메모 */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">메모</label>
                  <textarea
                    value={item.memo}
                    rows={2}
                    onChange={e => updateItem(item.localId, { memo: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900
                      bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
              </div>
            )}
          </div>
        ))}

        {/* ─── 항목 추가 버튼 ─── */}
        <button
          type="button"
          onClick={addItem}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs
            border border-dashed border-gray-300 rounded-lg text-gray-500
            hover:border-blue-400 hover:text-blue-500 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          항목 추가
        </button>
      </div>

      {/* ─── 저장 버튼 ─── */}
      {items.length > 0 && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={items.length === 0 || saving}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg
              hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? '저장 중...' : `구매 리스트에 추가 (${items.filter(i => i.title.trim()).length}개)`}
          </button>
        </div>
      )}
    </SectionWrapper>
  )
}
