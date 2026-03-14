'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import {
  loadGoogleAPIs,
  requestGoogleToken,
  openFolderPicker,
  uploadFileToDrive,
  getSavedInventoryFolder,
  saveInventoryFolderCookie,
} from '@/lib/googleDrive'
import type { DriveFolder } from '@/lib/googleDrive'

type InventoryCategory = 'chemical' | 'equipment' | 'consumable' | 'other'

interface InventoryItem {
  id: string
  category: InventoryCategory
  item_name: string
  current_qty: number
  unit: string
  min_qty: number
  last_updated: string
  description?: string | null
  storage_location?: string | null
  notes?: string | null
  created_at?: string | null
}

interface InventoryLog {
  id: string
  inventory_id: string
  worker_id: string | null
  change_type: 'use' | 'receive' | 'return' | 'adjust'
  quantity: number
  note: string | null
  created_at: string
  photo_url?: string | null
  worker_name?: string | null
}

const CATEGORY_CONFIG: Record<InventoryCategory, { label: string; dot: string; badge: string }> = {
  chemical: { label: '약품', dot: 'bg-purple-500', badge: 'bg-purple-100 text-purple-700' },
  equipment: { label: '장비', dot: 'bg-blue-500', badge: 'bg-blue-100 text-blue-700' },
  consumable: { label: '소모품', dot: 'bg-green-500', badge: 'bg-green-100 text-green-700' },
  other: { label: '기타', dot: 'bg-gray-400', badge: 'bg-gray-100 text-gray-600' },
}

const CHANGE_TYPE_LABELS: Record<string, string> = {
  receive: '수령',
  return: '반납',
  use: '사용',
  adjust: '조정',
}

const MIGRATION_SQL = `-- Supabase Dashboard SQL Editor에서 실행하세요
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS storage_location TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS worker_name TEXT;`

function parseNote(note: string | null): { text?: string; photo?: string; worker?: string } {
  if (!note) return {}
  try {
    const parsed = JSON.parse(note)
    if (typeof parsed === 'object' && parsed !== null) return parsed
  } catch {
    return { text: note }
  }
  return { text: note }
}

export default function AdminInventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [logs, setLogs] = useState<InventoryLog[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<InventoryCategory | 'all'>('all')

  // Edit form state
  const [editForm, setEditForm] = useState<Partial<InventoryItem>>({})
  const [editLoading, setEditLoading] = useState(false)

  // Add modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState<Partial<InventoryItem>>({
    category: 'chemical', current_qty: 0, min_qty: 0,
  })
  const [addLoading, setAddLoading] = useState(false)

  // Transaction modal state
  const [showTxModal, setShowTxModal] = useState(false)
  const [txType, setTxType] = useState<'receive' | 'return' | 'use' | 'adjust'>('receive')
  const [txQty, setTxQty] = useState('')
  const [txNote, setTxNote] = useState('')
  const [txPhoto, setTxPhoto] = useState<File | null>(null)
  const [txPhotoPreview, setTxPhotoPreview] = useState<string | null>(null)
  const [txLoading, setTxLoading] = useState(false)

  // Drive
  const [inventoryFolder, setInventoryFolder] = useState<DriveFolder | null>(null)
  const [showMigration, setShowMigration] = useState(false)
  const [logsLoading, setLogsLoading] = useState(false)

  useEffect(() => {
    setInventoryFolder(getSavedInventoryFolder())
    fetchItems()
  }, [])

  const fetchItems = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/inventory')
      if (!res.ok) throw new Error('재고 목록 조회 실패')
      const json = await res.json()
      setItems(json.items ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '조회 실패')
    } finally {
      setLoading(false)
    }
  }

  const fetchLogs = useCallback(async (itemId: string) => {
    setLogsLoading(true)
    try {
      const res = await fetch(`/api/admin/inventory/logs?inventory_id=${itemId}`)
      if (!res.ok) {
        setLogs([])
        return
      }
      const json = await res.json()
      setLogs(json.logs ?? [])
    } catch {
      setLogs([])
    } finally {
      setLogsLoading(false)
    }
  }, [])

  const handleSelectItem = (item: InventoryItem) => {
    setSelectedItem(item)
    setEditForm({
      item_name: item.item_name,
      category: item.category,
      unit: item.unit,
      min_qty: item.min_qty,
      description: item.description ?? '',
      storage_location: item.storage_location ?? '',
      notes: item.notes ?? '',
    })
    fetchLogs(item.id)
  }

  const handleSave = async () => {
    if (!selectedItem) return
    setEditLoading(true)
    try {
      const res = await fetch('/api/admin/inventory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedItem.id, ...editForm }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? '저장 실패')
      }
      const json = await res.json()
      setItems(prev => prev.map(it => it.id === selectedItem.id ? { ...it, ...json.item } : it))
      setSelectedItem(prev => prev ? { ...prev, ...json.item } : prev)
      toast.success('저장되었습니다')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setEditLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedItem) return
    if (!confirm(`"${selectedItem.item_name}"을(를) 삭제하시겠습니까?`)) return
    try {
      const res = await fetch(`/api/admin/inventory?id=${selectedItem.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? '삭제 실패')
      }
      setItems(prev => prev.filter(it => it.id !== selectedItem.id))
      setSelectedItem(null)
      setLogs([])
      toast.success('삭제되었습니다')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '삭제 실패')
    }
  }

  const handleAddItem = async () => {
    if (!addForm.item_name || !addForm.unit || !addForm.category) {
      toast.error('필수 항목을 입력해주세요')
      return
    }
    setAddLoading(true)
    try {
      const res = await fetch('/api/admin/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? '추가 실패')
      }
      const json = await res.json()
      setItems(prev => [...prev, json.item])
      setShowAddModal(false)
      setAddForm({ category: 'chemical', current_qty: 0, min_qty: 0 })
      toast.success('아이템이 추가되었습니다')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '추가 실패')
    } finally {
      setAddLoading(false)
    }
  }

  const openTxModal = (type: 'receive' | 'return' | 'use' | 'adjust') => {
    setTxType(type)
    setTxQty('')
    setTxNote('')
    setTxPhoto(null)
    setTxPhotoPreview(null)
    setShowTxModal(true)
  }

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setTxPhoto(file)
    const url = URL.createObjectURL(file)
    setTxPhotoPreview(url)
  }

  const handleTransaction = async () => {
    if (!selectedItem) return
    const qty = Number(txQty)
    if (!txQty || isNaN(qty) || qty <= 0) {
      toast.error('수량을 올바르게 입력해주세요')
      return
    }
    setTxLoading(true)
    try {
      let photoUrl: string | null = null
      if (txPhoto && inventoryFolder) {
        try {
          await loadGoogleAPIs()
          const token = await requestGoogleToken()
          const ext = txPhoto.name.split('.').pop() ?? 'jpg'
          const fileName = `재고_${selectedItem.item_name}_${Date.now()}.${ext}`
          const result = await uploadFileToDrive(txPhoto, inventoryFolder.id, fileName, token)
          photoUrl = result.fileUrl
        } catch (uploadErr) {
          toast.error('사진 업로드 실패 - 메모만 저장됩니다')
        }
      }

      const res = await fetch('/api/inventory/transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventory_id: selectedItem.id,
          change_type: txType,
          quantity: qty,
          note: txNote || null,
          photo_url: photoUrl,
        }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? '처리 실패')
      }
      const json = await res.json()

      // Update item qty in local state
      setItems(prev => prev.map(it =>
        it.id === selectedItem.id ? { ...it, current_qty: json.new_qty, last_updated: new Date().toISOString() } : it
      ))
      setSelectedItem(prev => prev ? { ...prev, current_qty: json.new_qty } : prev)
      setShowTxModal(false)
      toast.success('처리되었습니다')
      fetchLogs(selectedItem.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '처리 실패')
    } finally {
      setTxLoading(false)
    }
  }

  const handleDriveSetup = async () => {
    try {
      await loadGoogleAPIs()
      const token = await requestGoogleToken()
      const folder = await openFolderPicker(token)
      if (folder) {
        saveInventoryFolderCookie(folder)
        setInventoryFolder(folder)
        toast.success(`폴더 설정: ${folder.name}`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Drive 설정 실패')
    }
  }

  const filteredItems = items.filter(item => {
    const matchCategory = categoryFilter === 'all' || item.category === categoryFilter
    const matchSearch = !searchQuery || item.item_name.toLowerCase().includes(searchQuery.toLowerCase())
    return matchCategory && matchSearch
  })

  const lowStockItems = items.filter(it => it.current_qty <= it.min_qty)

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Left Panel */}
      <div className="w-80 flex flex-col bg-white border-r border-gray-200 shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold text-gray-900">재고 관리</h1>
            <div className="flex gap-2">
              <button
                onClick={handleDriveSetup}
                className="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                title="Drive 폴더 설정"
              >
                Drive 설정
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="text-xs px-3 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
              >
                + 아이템 추가
              </button>
            </div>
          </div>

          {inventoryFolder && (
            <div className="text-xs text-green-600 mb-2">📁 {inventoryFolder.name}</div>
          )}

          {/* Search */}
          <input
            type="text"
            placeholder="아이템 검색..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
          />

          {/* Category filter */}
          <div className="flex gap-1 flex-wrap">
            {(['all', 'chemical', 'equipment', 'consumable', 'other'] as const).map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                  categoryFilter === cat
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {cat === 'all' ? '전체' : CATEGORY_CONFIG[cat].label}
              </button>
            ))}
          </div>
        </div>

        {/* Low stock warning */}
        {lowStockItems.length > 0 && (
          <div className="mx-3 mt-3 p-3 rounded-xl bg-red-50 border border-red-200">
            <p className="text-xs font-semibold text-red-700 mb-1">⚠️ 재고 부족 {lowStockItems.length}건</p>
            <ul className="text-xs text-red-600 space-y-0.5">
              {lowStockItems.slice(0, 3).map(it => (
                <li key={it.id}>{it.item_name}: {it.current_qty}/{it.min_qty}{it.unit}</li>
              ))}
              {lowStockItems.length > 3 && <li>...외 {lowStockItems.length - 3}건</li>}
            </ul>
          </div>
        )}

        {/* Item list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {loading ? (
            <div className="text-center text-gray-400 text-sm py-8">불러오는 중...</div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-8">항목 없음</div>
          ) : (
            filteredItems.map(item => {
              const cfg = CATEGORY_CONFIG[item.category]
              const isLow = item.current_qty <= item.min_qty
              const isSelected = selectedItem?.id === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectItem(item)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors border ${
                    isSelected
                      ? 'bg-blue-50 border-blue-200'
                      : 'bg-white border-transparent hover:bg-gray-50 hover:border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                    <span className="flex-1 text-sm font-medium text-gray-900 truncate">{item.item_name}</span>
                    {isLow && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-medium shrink-0">
                        ▼부족
                      </span>
                    )}
                  </div>
                  <div className="ml-4 flex items-center justify-between mt-0.5">
                    <span className="text-xs text-gray-400">{cfg.label}</span>
                    <span className={`text-xs font-semibold ${isLow ? 'text-red-600' : 'text-gray-700'}`}>
                      {item.current_qty} {item.unit}
                    </span>
                  </div>
                  {item.storage_location && (
                    <div className="ml-4 text-xs text-gray-400 truncate">{item.storage_location}</div>
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* Migration SQL notice */}
        <div className="p-3 border-t border-gray-100">
          <button
            onClick={() => setShowMigration(v => !v)}
            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
          >
            🔧 DB 마이그레이션 SQL {showMigration ? '▲' : '▼'}
          </button>
          {showMigration && (
            <div className="mt-2">
              <pre className="text-xs bg-gray-900 text-green-400 p-2 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">
                {MIGRATION_SQL}
              </pre>
              <button
                onClick={() => { navigator.clipboard.writeText(MIGRATION_SQL); toast.success('복사됨') }}
                className="mt-1 text-xs text-blue-600 hover:underline"
              >
                복사
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 overflow-y-auto">
        {!selectedItem ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <div className="text-5xl mb-3">📦</div>
              <p className="text-lg">아이템을 선택하세요</p>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto p-6 space-y-6">
            {/* Item header */}
            <div className="flex items-center gap-3">
              <span className={`w-3 h-3 rounded-full ${CATEGORY_CONFIG[selectedItem.category].dot}`} />
              <h2 className="text-xl font-bold text-gray-900">{selectedItem.item_name}</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full ${CATEGORY_CONFIG[selectedItem.category].badge}`}>
                {CATEGORY_CONFIG[selectedItem.category].label}
              </span>
              {selectedItem.current_qty <= selectedItem.min_qty && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">▼재고부족</span>
              )}
            </div>

            {/* Edit form */}
            <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
              <h3 className="font-semibold text-gray-800">기본 정보</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">아이템명</label>
                  <input
                    value={editForm.item_name ?? ''}
                    onChange={e => setEditForm(f => ({ ...f, item_name: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">카테고리</label>
                  <select
                    value={editForm.category ?? 'other'}
                    onChange={e => setEditForm(f => ({ ...f, category: e.target.value as InventoryCategory }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="chemical">약품</option>
                    <option value="equipment">장비</option>
                    <option value="consumable">소모품</option>
                    <option value="other">기타</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">단위</label>
                  <input
                    value={editForm.unit ?? ''}
                    onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">최소 수량</label>
                  <input
                    type="number"
                    min={0}
                    value={editForm.min_qty ?? 0}
                    onChange={e => setEditForm(f => ({ ...f, min_qty: Number(e.target.value) }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">설명</label>
                <input
                  value={editForm.description ?? ''}
                  onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="(선택)"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">보관 위치</label>
                <input
                  value={editForm.storage_location ?? ''}
                  onChange={e => setEditForm(f => ({ ...f, storage_location: e.target.value }))}
                  placeholder="(선택)"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">메모</label>
                <textarea
                  value={editForm.notes ?? ''}
                  onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="(선택)"
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="flex gap-2 justify-between">
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 text-sm font-medium transition-colors"
                >
                  🗑️ 삭제
                </button>
                <button
                  onClick={handleSave}
                  disabled={editLoading}
                  className="px-6 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {editLoading ? '저장 중...' : '💾 저장'}
                </button>
              </div>
            </div>

            {/* Current stock & transactions */}
            <div className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-gray-800">현재 재고</h3>
                  <p className={`text-3xl font-bold mt-1 ${selectedItem.current_qty <= selectedItem.min_qty ? 'text-red-600' : 'text-gray-900'}`}>
                    {selectedItem.current_qty}
                    <span className="text-base font-normal text-gray-500 ml-1">{selectedItem.unit}</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">최소 {selectedItem.min_qty}{selectedItem.unit}</p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <button
                  onClick={() => openTxModal('receive')}
                  className="py-2 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 text-sm font-medium transition-colors border border-green-200"
                >
                  수령 +
                </button>
                <button
                  onClick={() => openTxModal('return')}
                  className="py-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-sm font-medium transition-colors border border-blue-200"
                >
                  반납 +
                </button>
                <button
                  onClick={() => openTxModal('use')}
                  className="py-2 rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 text-sm font-medium transition-colors border border-orange-200"
                >
                  사용 -
                </button>
                <button
                  onClick={() => openTxModal('adjust')}
                  className="py-2 rounded-lg bg-gray-50 text-gray-700 hover:bg-gray-100 text-sm font-medium transition-colors border border-gray-200"
                >
                  조정 =
                </button>
              </div>
            </div>

            {/* Transaction history */}
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 mb-3">거래 내역 (최근 20건)</h3>
              {logsLoading ? (
                <div className="text-center text-gray-400 text-sm py-4">불러오는 중...</div>
              ) : logs.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-4">거래 내역이 없습니다</div>
              ) : (
                <div className="space-y-2">
                  {logs.map(log => {
                    const noteData = parseNote(log.note)
                    const photoUrl = log.photo_url ?? noteData.photo
                    const workerName = log.worker_name ?? noteData.worker
                    const noteText = noteData.text
                    return (
                      <div key={log.id} className="flex items-start gap-3 text-sm border-b border-gray-50 pb-2 last:border-0">
                        <span className={`shrink-0 text-xs px-2 py-0.5 rounded font-medium ${
                          log.change_type === 'receive' ? 'bg-green-100 text-green-700' :
                          log.change_type === 'return' ? 'bg-blue-100 text-blue-700' :
                          log.change_type === 'use' ? 'bg-orange-100 text-orange-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {CHANGE_TYPE_LABELS[log.change_type]}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-800">{log.quantity}</span>
                            {workerName && <span className="text-xs text-gray-400">{workerName}</span>}
                          </div>
                          {noteText && <p className="text-xs text-gray-500 truncate">{noteText}</p>}
                          {photoUrl && (
                            <a href={photoUrl} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-blue-500 hover:underline">
                              📷 사진 보기
                            </a>
                          )}
                        </div>
                        <span className="shrink-0 text-xs text-gray-400 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">아이템 추가</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">아이템명 *</label>
                <input
                  value={addForm.item_name ?? ''}
                  onChange={e => setAddForm(f => ({ ...f, item_name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="예: 에탄올 70%"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">카테고리 *</label>
                  <select
                    value={addForm.category ?? 'other'}
                    onChange={e => setAddForm(f => ({ ...f, category: e.target.value as InventoryCategory }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="chemical">약품</option>
                    <option value="equipment">장비</option>
                    <option value="consumable">소모품</option>
                    <option value="other">기타</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">단위 *</label>
                  <input
                    value={addForm.unit ?? ''}
                    onChange={e => setAddForm(f => ({ ...f, unit: e.target.value }))}
                    placeholder="예: L, 개, kg"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">현재 수량 *</label>
                  <input
                    type="number"
                    min={0}
                    value={addForm.current_qty ?? 0}
                    onChange={e => setAddForm(f => ({ ...f, current_qty: Number(e.target.value) }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">최소 수량 *</label>
                  <input
                    type="number"
                    min={0}
                    value={addForm.min_qty ?? 0}
                    onChange={e => setAddForm(f => ({ ...f, min_qty: Number(e.target.value) }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">보관 위치</label>
                <input
                  value={addForm.storage_location ?? ''}
                  onChange={e => setAddForm(f => ({ ...f, storage_location: e.target.value }))}
                  placeholder="(선택)"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">설명</label>
                <input
                  value={addForm.description ?? ''}
                  onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="(선택)"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleAddItem}
                disabled={addLoading}
                className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {addLoading ? '추가 중...' : '추가'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Modal */}
      {showTxModal && selectedItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">
              {CHANGE_TYPE_LABELS[txType]}
            </h2>
            <p className="text-sm text-gray-500 mb-4">{selectedItem.item_name} (현재: {selectedItem.current_qty}{selectedItem.unit})</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  {txType === 'adjust' ? '조정 수량 (절대값)' : '수량'}
                </label>
                <input
                  type="number"
                  min={0}
                  value={txQty}
                  onChange={e => setTxQty(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-lg font-bold"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">메모</label>
                <textarea
                  value={txNote}
                  onChange={e => setTxNote(e.target.value)}
                  placeholder="(선택)"
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">사진</label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-600 hover:bg-gray-100 transition-colors">
                    📷 사진 촬영
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoCapture}
                    className="hidden"
                  />
                  {txPhoto && <span className="text-xs text-green-600">{txPhoto.name}</span>}
                </label>
                {txPhotoPreview && (
                  <img src={txPhotoPreview} alt="미리보기" className="mt-2 w-full h-32 object-cover rounded-lg" />
                )}
                {!inventoryFolder && txPhoto && (
                  <p className="text-xs text-orange-500 mt-1">Drive 폴더가 설정되지 않아 사진이 업로드되지 않습니다</p>
                )}
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowTxModal(false)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleTransaction}
                disabled={txLoading}
                className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {txLoading ? '처리 중...' : '확인'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
