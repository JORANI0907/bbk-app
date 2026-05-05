'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { useModalBackButton } from '@/hooks/useModalBackButton'
import { Button } from '@/components/ui'
import { Camera, Package, Image as ImageIcon } from 'lucide-react'

type InventoryCategory = 'chemical' | 'equipment' | 'consumable' | 'other'

interface InventoryItem {
  id: string
  category: InventoryCategory
  item_name: string
  current_qty: number
  unit: string
  min_qty: number
  last_updated: string
  storage_location?: string | null
}

const CATEGORY_CONFIG: Record<InventoryCategory, { label: string; dot: string }> = {
  chemical: { label: '약품', dot: 'bg-purple-500' },
  equipment: { label: '장비', dot: 'bg-blue-500' },
  consumable: { label: '소모품', dot: 'bg-green-500' },
  other: { label: '기타', dot: 'bg-gray-400' },
}

type TxType = 'receive' | 'return'

export default function WorkerInventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<InventoryCategory | 'all'>('all')

  // Modal state
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [txType, setTxType] = useState<TxType>('receive')
  const [quantity, setQuantity] = useState('1')
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchItems()
  }, [])

  const fetchItems = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/inventory/items')
      if (!res.ok) throw new Error('조회 실패')
      const json = await res.json()
      setItems(json.items ?? [])
    } catch {
      toast.error('재고 목록을 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }

  const openModal = (item: InventoryItem) => {
    setSelectedItem(item)
    setTxType('receive')
    setQuantity('1')
    setNote('')
    setPhoto(null)
    setPhotoPreview(null)
  }

  const closeModal = useCallback(() => {
    setSelectedItem(null)
  }, [])

  useModalBackButton(!!selectedItem, closeModal)

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const handleSubmit = async () => {
    if (!selectedItem) return
    const qty = Number(quantity)
    if (!quantity || isNaN(qty) || qty <= 0) {
      toast.error('수량을 올바르게 입력해주세요')
      return
    }

    setSubmitting(true)
    let photoUrl: string | null = null

    try {
      if (photo) {
        try {
          const fd = new FormData()
          fd.append('photo', photo)
          fd.append('item_name', selectedItem.item_name)
          fd.append('tx_type', txType)
          const uploadRes = await fetch('/api/inventory/photo', { method: 'POST', body: fd })
          if (uploadRes.ok) {
            const uploadData = await uploadRes.json()
            photoUrl = uploadData.url ?? null
          } else {
            const uploadData = await uploadRes.json()
            throw new Error(uploadData.error ?? '사진 업로드 실패')
          }
        } catch (uploadErr) {
          const msg = uploadErr instanceof Error ? uploadErr.message : '사진 업로드 실패'
          toast.error(`사진 업로드 실패: ${msg}\n사진 없이 처리합니다.`, { duration: 4000 })
        }
      }

      const res = await fetch('/api/inventory/transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventory_id: selectedItem.id,
          change_type: txType,
          quantity: qty,
          note: note || null,
          photo_url: photoUrl,
        }),
      })

      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? '처리 실패')
      }

      const json = await res.json()

      setItems(prev => prev.map(it =>
        it.id === selectedItem.id ? { ...it, current_qty: json.new_qty } : it
      ))

      toast.success(txType === 'receive' ? '수령이 완료되었습니다' : '반납이 완료되었습니다')
      closeModal()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '처리 실패')
    } finally {
      setSubmitting(false)
    }
  }

  const filteredItems = items.filter(item => {
    const matchCat = categoryFilter === 'all' || item.category === categoryFilter
    const matchSearch = !searchQuery || item.item_name.includes(searchQuery)
    return matchCat && matchSearch
  })

  return (
    <div className="min-h-screen bg-surface-sunken pb-24">
      {/* Header */}
      <div className="sticky top-0 bg-surface border-b border-border z-10">
        <div className="px-4 pt-4 pb-3">
          <h1 className="text-lg font-bold text-text-primary mb-3">재고 수령/반납</h1>

          {/* Search */}
          <input
            type="text"
            placeholder="재고 검색..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3 bg-surface-sunken"
          />

          {/* Category filter pills */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {(['all', 'chemical', 'equipment', 'consumable', 'other'] as const).map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`shrink-0 text-sm px-4 py-1.5 rounded-full border transition-colors font-medium ${
                  categoryFilter === cat
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-surface text-text-secondary border-border'
                }`}
              >
                {cat === 'all' ? '전체' : CATEGORY_CONFIG[cat].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pt-4">
        {loading ? (
          <div className="text-center text-text-tertiary py-12">불러오는 중...</div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center text-text-tertiary py-12">
            <Package size={40} className="mx-auto mb-2 text-text-tertiary" />
            <p>항목이 없습니다</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredItems.map(item => {
              const cfg = CATEGORY_CONFIG[item.category]
              const isLow = item.current_qty <= item.min_qty
              return (
                <button
                  key={item.id}
                  onClick={() => openModal(item)}
                  className="text-left bg-surface rounded-2xl shadow-soft p-4 border border-border-subtle hover:shadow-card active:scale-[0.98] transition-all"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />
                    <span className="text-xs text-text-tertiary font-medium">{cfg.label}</span>
                    {isLow && (
                      <span className="ml-auto text-xs px-1.5 py-0.5 rounded-full bg-state-danger-bg text-state-danger font-semibold shrink-0">
                        부족
                      </span>
                    )}
                  </div>
                  <p className="font-semibold text-text-primary text-sm leading-tight mb-1">{item.item_name}</p>
                  {item.storage_location && (
                    <p className="text-xs text-text-tertiary mb-1 truncate">{item.storage_location}</p>
                  )}
                  <p className={`text-xl font-bold ${isLow ? 'text-state-danger' : 'text-brand-600'}`}>
                    {item.current_qty}
                    <span className="text-sm font-normal text-text-secondary ml-0.5">{item.unit}</span>
                  </p>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Transaction Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-surface rounded-t-3xl sm:rounded-2xl shadow-modal w-full sm:max-w-sm max-h-[90vh] overflow-y-auto">
            <div className="p-5">
              {/* Handle bar for mobile */}
              <div className="w-10 h-1 rounded-full bg-border mx-auto mb-4 sm:hidden" />

              <h2 className="text-lg font-bold text-text-primary mb-0.5">{selectedItem.item_name}</h2>
              <p className="text-sm text-text-tertiary mb-4">
                현재 재고: <span className="font-semibold text-text-primary">{selectedItem.current_qty}{selectedItem.unit}</span>
              </p>

              {/* Type toggle */}
              <div className="flex gap-2 mb-4 p-1 bg-surface-sunken rounded-xl">
                <button
                  onClick={() => setTxType('receive')}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                    txType === 'receive'
                      ? 'bg-surface text-state-success shadow-flat'
                      : 'text-text-secondary'
                  }`}
                >
                  수령 받기
                </button>
                <button
                  onClick={() => setTxType('return')}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                    txType === 'return'
                      ? 'bg-surface text-brand-700 shadow-flat'
                      : 'text-text-secondary'
                  }`}
                >
                  반납 하기
                </button>
              </div>

              {/* Quantity */}
              <div className="mb-3">
                <label className="block text-xs font-medium text-text-secondary mb-1">수량</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  className="w-full px-4 py-3 text-center text-2xl font-bold border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-text-primary"
                />
              </div>

              {/* Note */}
              <div className="mb-3">
                <label className="block text-xs font-medium text-text-secondary mb-1">메모 (선택)</label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="비고를 입력하세요..."
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-text-primary"
                />
              </div>

              {/* Photo */}
              <div className="mb-5">
                <div className="flex gap-2">
                  <label className="flex-1 cursor-pointer">
                    <div className="flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-border rounded-xl text-text-secondary hover:border-brand-400 hover:text-brand-500 transition-colors">
                      <Camera size={16} />
                      <span className="text-sm font-medium">카메라</span>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoCapture}
                      className="hidden"
                    />
                  </label>
                  <label className="flex-1 cursor-pointer">
                    <div className="flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-border rounded-xl text-text-secondary hover:border-brand-400 hover:text-brand-500 transition-colors">
                      <ImageIcon size={16} />
                      <span className="text-sm font-medium">갤러리</span>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoCapture}
                      className="hidden"
                    />
                  </label>
                </div>
                {photoPreview && (
                  <div className="mt-2 relative">
                    <img src={photoPreview} alt="미리보기" className="w-full h-36 object-cover rounded-xl" />
                    <button
                      onClick={() => { setPhoto(null); setPhotoPreview(null) }}
                      className="absolute top-2 right-2 w-6 h-6 bg-black/50 rounded-full text-white text-xs flex items-center justify-center"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              {/* Buttons */}
              <div className="flex gap-3">
                <Button
                  onClick={submitting ? undefined : closeModal}
                  disabled={submitting}
                  variant="secondary"
                  className="flex-1 py-3 rounded-xl text-sm font-semibold"
                >
                  취소
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={submitting}
                  isLoading={submitting}
                  variant="primary"
                  className={`flex-1 py-3 rounded-xl text-sm font-semibold ${
                    txType === 'receive' ? 'bg-green-600 hover:bg-green-700' : ''
                  }`}
                >
                  {submitting ? '처리 중...' : '확인'}
                </Button>
              </div>
              {submitting && (
                <p className="text-xs text-center text-text-tertiary mt-2">
                  처리 중입니다...
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
