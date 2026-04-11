'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
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
type TxType = 'receive' | 'return' | 'use' | 'adjust'
type MainTab = 'status' | 'logs'

interface InventoryItem {
  id: string
  category: InventoryCategory
  item_name: string
  current_qty: number
  unit: string
  min_qty: number
  last_updated: string
  created_at?: string | null
}

interface InventoryLog {
  id: string
  inventory_id: string
  worker_id: string | null
  change_type: TxType
  quantity: number
  note: string | null
  created_at: string
  photo_url?: string | null
  worker_name?: string | null
}

interface AdminInventoryLog extends InventoryLog {
  item_name: string
}

const CATEGORY_CONFIG: Record<InventoryCategory, { label: string; dot: string; badge: string }> = {
  chemical:   { label: '약품',   dot: 'bg-purple-500', badge: 'bg-purple-100 text-purple-700' },
  equipment:  { label: '장비',   dot: 'bg-blue-500',   badge: 'bg-blue-100 text-blue-700' },
  consumable: { label: '소모품', dot: 'bg-green-500',  badge: 'bg-green-100 text-green-700' },
  other:      { label: '기타',   dot: 'bg-gray-400',   badge: 'bg-gray-100 text-gray-600' },
}

const TX_LABELS: Record<TxType, string> = {
  receive: '입고',
  use:     '수령',
  return:  '반납',
  adjust:  '조정',
}

const TX_DESCRIPTIONS: Record<TxType, string> = {
  receive: '물품이 창고에 들어올 때 관리자가 입력합니다. 재고가 증가합니다.',
  use:     '관리자 또는 직원이 창고에서 물품을 가져갈 때 입력합니다. 재고가 감소합니다.',
  return:  '관리자 또는 직원이 물품을 창고에 반납할 때 입력합니다. 재고가 증가합니다.',
  adjust:  '재고 조사 후 관리자가 실제 수량으로 맞출 때 사용합니다. 입력값이 새 재고량이 됩니다.',
}

const TX_BUTTON_STYLE: Record<TxType, string> = {
  receive: 'bg-green-50 text-green-700 hover:bg-green-100 border-green-200',
  use:     'bg-orange-50 text-orange-700 hover:bg-orange-100 border-orange-200',
  return:  'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200',
  adjust:  'bg-gray-50 text-gray-700 hover:bg-gray-100 border-gray-200',
}

const TX_EFFECT: Record<TxType, string> = {
  receive: '+ 증가',
  use:     '− 감소',
  return:  '+ 증가',
  adjust:  '= 절대값',
}

// 수령/반납은 사진 필수
const PHOTO_REQUIRED: TxType[] = ['use', 'return']

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
  const [role, setRole] = useState<string>('')

  const [editForm, setEditForm] = useState<{ item_name: string; category: InventoryCategory; unit: string }>({
    item_name: '', category: 'chemical', unit: '',
  })
  const [editLoading, setEditLoading] = useState(false)

  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState<{ item_name: string; category: InventoryCategory; unit: string; current_qty: number }>({
    item_name: '', category: 'chemical', unit: '', current_qty: 0,
  })
  const [addLoading, setAddLoading] = useState(false)

  const [showTxModal, setShowTxModal] = useState(false)
  const [txType, setTxType] = useState<TxType>('receive')
  const [txQty, setTxQty] = useState('')
  const [txNote, setTxNote] = useState('')
  const [txPhoto, setTxPhoto] = useState<File | null>(null)
  const [txPhotoPreview, setTxPhotoPreview] = useState<string | null>(null)
  const [txLoading, setTxLoading] = useState(false)

  const [inventoryFolder, setInventoryFolder] = useState<DriveFolder | null>(null)
  const [apisReady, setApisReady] = useState(false)
  const [logsLoading, setLogsLoading] = useState(false)

  // 변동내역 탭 (관리자 전용)
  const [mainTab, setMainTab] = useState<MainTab>('status')
  const [adminLogs, setAdminLogs] = useState<AdminInventoryLog[]>([])
  const [adminLogsLoading, setAdminLogsLoading] = useState(false)
  const [logMonth, setLogMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [logType, setLogType] = useState<'all' | 'use' | 'return'>('all')

  // OAuth 토큰 캐시 (사진 선택 시 시작된 Promise)
  const tokenPromiseRef = useRef<Promise<string> | null>(null)

  // ── 초기화 ──────────────────────────────────────────────────
  useEffect(() => {
    setInventoryFolder(getSavedInventoryFolder())
    fetchItems()
    fetch('/api/auth/me').then(r => r.json()).then(d => setRole(d.user?.role ?? ''))
    // Google API 스크립트 사전 로드
    loadGoogleAPIs()
      .then(() => setApisReady(true))
      .catch(() => {})
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
      if (!res.ok) { setLogs([]); return }
      const json = await res.json()
      setLogs(json.logs ?? [])
    } catch {
      setLogs([])
    } finally {
      setLogsLoading(false)
    }
  }, [])

  const fetchAdminLogs = useCallback(async (month: string, type: 'all' | 'use' | 'return') => {
    setAdminLogsLoading(true)
    try {
      const params = new URLSearchParams({ month, type })
      const res = await fetch(`/api/admin/inventory/admin-logs?${params}`)
      if (!res.ok) { setAdminLogs([]); return }
      const json = await res.json()
      setAdminLogs(json.logs ?? [])
    } catch {
      setAdminLogs([])
    } finally {
      setAdminLogsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (mainTab === 'logs' && role === 'admin') {
      fetchAdminLogs(logMonth, logType)
    }
  }, [mainTab, logMonth, logType, role, fetchAdminLogs])

  const handleSelectItem = (item: InventoryItem) => {
    setSelectedItem(item)
    setEditForm({ item_name: item.item_name, category: item.category, unit: item.unit })
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
      if (!res.ok) throw new Error((await res.json()).error ?? '저장 실패')
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
      if (!res.ok) throw new Error((await res.json()).error ?? '삭제 실패')
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
        body: JSON.stringify({ ...addForm, min_qty: 0 }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? '추가 실패')
      const json = await res.json()
      setItems(prev => [...prev, json.item])
      setShowAddModal(false)
      setAddForm({ item_name: '', category: 'chemical', unit: '', current_qty: 0 })
      toast.success('아이템이 추가되었습니다')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '추가 실패')
    } finally {
      setAddLoading(false)
    }
  }

  const openTxModal = (type: TxType) => {
    setTxType(type)
    setTxQty('')
    setTxNote('')
    setTxPhoto(null)
    setTxPhotoPreview(null)
    tokenPromiseRef.current = null
    setShowTxModal(true)
  }

  // ── 사진 선택 시: 동기적으로 OAuth 시작 (user gesture 유지) ──
  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setTxPhoto(file)
    setTxPhotoPreview(URL.createObjectURL(file))

    // 사진 선택은 user gesture → 이 시점에 await 없이 OAuth 시작
    if (apisReady && inventoryFolder && !tokenPromiseRef.current) {
      tokenPromiseRef.current = requestGoogleToken()
        .catch(err => {
          tokenPromiseRef.current = null
          throw err
        })
    }
  }

  // ── Drive 저장 위치 설정 (관리자) ─────────────────────────────
  // 버튼 클릭 = user gesture → requestGoogleToken() 동기 호출 가능
  function handleDriveSetup() {
    if (!apisReady) {
      toast.error('Google API 로딩 중입니다. 잠시 후 다시 시도해주세요.')
      return
    }
    // OAuth 시작 (동기, user gesture 맥락)
    requestGoogleToken()
      .then(token => openFolderPicker(token))
      .then(folder => {
        if (folder) {
          saveInventoryFolderCookie(folder)
          setInventoryFolder(folder)
          toast.success(`저장 위치 설정 완료: ${folder.name}`)
        }
      })
      .catch(err => toast.error(err instanceof Error ? err.message : 'Drive 설정 실패'))
  }

  // ── 입출고 처리 ──────────────────────────────────────────────
  const handleTransaction = async () => {
    if (!selectedItem) return
    const qty = Number(txQty)
    if (!txQty || isNaN(qty) || qty <= 0) {
      toast.error('수량을 0보다 크게 입력해주세요')
      return
    }

    // 수령/반납 사진 필수
    if (PHOTO_REQUIRED.includes(txType) && !txPhoto) {
      toast.error(`${TX_LABELS[txType]} 시 사진을 첨부해야 합니다.`)
      return
    }

    // 사진은 있는데 Drive 폴더 미설정
    if (txPhoto && !inventoryFolder) {
      toast.error('Drive 저장 위치를 먼저 설정해주세요. (⚙️ 버튼)')
      return
    }

    setTxLoading(true)
    try {
      let photoUrl: string | null = null
      if (txPhoto && inventoryFolder) {
        let token: string
        if (tokenPromiseRef.current) {
          token = await tokenPromiseRef.current
        } else {
          // fallback: 직접 요청 (팝업 차단될 수 있음)
          token = await requestGoogleToken()
        }
        const ext = txPhoto.name.split('.').pop() ?? 'jpg'
        const result = await uploadFileToDrive(
          txPhoto,
          inventoryFolder.id,
          `재고_${selectedItem.item_name}_${Date.now()}.${ext}`,
          token
        )
        photoUrl = result.fileUrl
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
      if (!res.ok) throw new Error((await res.json()).error ?? '처리 실패')
      const json = await res.json()
      setItems(prev => prev.map(it =>
        it.id === selectedItem.id
          ? { ...it, current_qty: json.new_qty, last_updated: new Date().toISOString() }
          : it
      ))
      setSelectedItem(prev => prev ? { ...prev, current_qty: json.new_qty } : prev)
      setShowTxModal(false)
      toast.success('처리되었습니다')
      fetchLogs(selectedItem.id)
    } catch (err) {
      tokenPromiseRef.current = null
      toast.error(err instanceof Error ? err.message : '처리 실패')
    } finally {
      setTxLoading(false)
    }
  }

  const exportAdminLogsCSV = () => {
    const headers = ['직원명', '품목', '유형', '수량', '날짜']
    const rows = adminLogs.map(l => [
      l.worker_name ?? '',
      l.item_name,
      TX_LABELS[l.change_type],
      l.quantity,
      new Date(l.created_at).toLocaleDateString('ko-KR'),
    ])
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `재고변동내역_${logMonth}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // 변동내역 집계
  const workerLogMap: Record<string, Record<string, { use: number; return: number; lastDate: string }>> = {}
  for (const log of adminLogs) {
    const workerKey = log.worker_name ?? log.worker_id ?? '미상'
    if (!workerLogMap[workerKey]) workerLogMap[workerKey] = {}
    if (!workerLogMap[workerKey][log.item_name]) {
      workerLogMap[workerKey][log.item_name] = { use: 0, return: 0, lastDate: '' }
    }
    const entry = workerLogMap[workerKey][log.item_name]
    if (log.change_type === 'use') entry.use += log.quantity
    if (log.change_type === 'return') entry.return += log.quantity
    if (!entry.lastDate || log.created_at > entry.lastDate) entry.lastDate = log.created_at
  }

  const itemUsageMap: Record<string, number> = {}
  for (const log of adminLogs) {
    if (log.change_type === 'use') {
      itemUsageMap[log.item_name] = (itemUsageMap[log.item_name] ?? 0) + log.quantity
    }
  }
  const totalUse = adminLogs.filter(l => l.change_type === 'use').reduce((s, l) => s + l.quantity, 0)
  const totalReturn = adminLogs.filter(l => l.change_type === 'return').reduce((s, l) => s + l.quantity, 0)
  const maxUsage = Math.max(...Object.values(itemUsageMap), 1)

  const filteredItems = items.filter(item => {
    const matchCategory = categoryFilter === 'all' || item.category === categoryFilter
    const matchSearch = !searchQuery || item.item_name.toLowerCase().includes(searchQuery.toLowerCase())
    return matchCategory && matchSearch
  })

  const needsPhoto = PHOTO_REQUIRED.includes(txType)
  const canSubmit = needsPhoto ? !!txPhoto : true

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      {/* 탭 바 */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-0 bg-white border-b border-gray-200 shrink-0">
        <button
          onClick={() => setMainTab('status')}
          className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors border-b-2 ${mainTab === 'status' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          재고 현황
        </button>
        {role === 'admin' && (
          <button
            onClick={() => setMainTab('logs')}
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors border-b-2 ${mainTab === 'logs' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            변동내역
          </button>
        )}
      </div>

      {/* 변동내역 탭 */}
      {mainTab === 'logs' && role === 'admin' ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 필터 */}
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="month"
              value={logMonth}
              onChange={e => setLogMonth(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-1">
              {(['all', 'use', 'return'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setLogType(t)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${logType === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
                >
                  {t === 'all' ? '전체' : t === 'use' ? '수령' : '반납'}
                </button>
              ))}
            </div>
            <button
              onClick={exportAdminLogsCSV}
              disabled={adminLogs.length === 0}
              className="ml-auto px-4 py-2 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              엑셀 다운로드 (CSV)
            </button>
          </div>

          {adminLogsLoading ? (
            <div className="text-center text-gray-400 text-sm py-12">불러오는 중...</div>
          ) : (
            <>
              {/* 월간 요약 카드 */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-orange-50 rounded-xl p-4">
                  <p className="text-xs text-orange-600 font-medium">총 수령 건수</p>
                  <p className="text-2xl font-bold text-orange-700 mt-1">{adminLogs.filter(l => l.change_type === 'use').length}건</p>
                  <p className="text-xs text-orange-500 mt-0.5">수량 합계 {totalUse}</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-4">
                  <p className="text-xs text-blue-600 font-medium">총 반납 건수</p>
                  <p className="text-2xl font-bold text-blue-700 mt-1">{adminLogs.filter(l => l.change_type === 'return').length}건</p>
                  <p className="text-xs text-blue-500 mt-0.5">수량 합계 {totalReturn}</p>
                </div>
                <div className="bg-purple-50 rounded-xl p-4">
                  <p className="text-xs text-purple-600 font-medium">순 소비량</p>
                  <p className="text-2xl font-bold text-purple-700 mt-1">{(totalUse - totalReturn).toFixed(1)}</p>
                  <p className="text-xs text-purple-500 mt-0.5">수령 - 반납</p>
                </div>
              </div>

              {/* 품목별 사용량 막대그래프 */}
              {Object.keys(itemUsageMap).length > 0 && (
                <div className="bg-white rounded-xl shadow-sm p-5">
                  <h3 className="font-semibold text-gray-800 mb-3">품목별 수령량</h3>
                  <div className="space-y-2">
                    {Object.entries(itemUsageMap)
                      .sort(([, a], [, b]) => b - a)
                      .map(([name, qty]) => (
                        <div key={name} className="flex items-center gap-3">
                          <span className="text-xs text-gray-600 w-28 shrink-0 truncate">{name}</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                            <div
                              className="bg-orange-400 h-4 rounded-full transition-all"
                              style={{ width: `${(qty / maxUsage) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-gray-700 w-10 text-right">{qty}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* 직원별 사용량 테이블 */}
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <h3 className="font-semibold text-gray-800 px-5 py-4 border-b border-gray-100">직원별 사용량</h3>
                {Object.keys(workerLogMap).length === 0 ? (
                  <div className="text-center text-gray-400 text-sm py-8">내역이 없습니다.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-xs font-semibold text-gray-500">
                          <th className="text-left px-4 py-3">직원명</th>
                          <th className="text-left px-4 py-3">품목</th>
                          <th className="text-right px-4 py-3">수령</th>
                          <th className="text-right px-4 py-3">반납</th>
                          <th className="text-right px-4 py-3">순사용</th>
                          <th className="text-right px-4 py-3">마지막 날짜</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(workerLogMap).flatMap(([worker, items]) =>
                          Object.entries(items).map(([item, stat], idx) => (
                            <tr key={`${worker}-${item}`} className="border-t border-gray-50 hover:bg-gray-50">
                              <td className="px-4 py-2.5 text-gray-800 font-medium">{idx === 0 ? worker : ''}</td>
                              <td className="px-4 py-2.5 text-gray-600">{item}</td>
                              <td className="px-4 py-2.5 text-right text-orange-600">{stat.use}</td>
                              <td className="px-4 py-2.5 text-right text-blue-600">{stat.return}</td>
                              <td className="px-4 py-2.5 text-right font-semibold text-purple-700">{(stat.use - stat.return).toFixed(1)}</td>
                              <td className="px-4 py-2.5 text-right text-gray-400 text-xs">
                                {stat.lastDate ? new Date(stat.lastDate).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) : '-'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ) : (

      <div className="flex flex-1 overflow-hidden">
      {/* Left Panel */}
      <div className="w-80 flex flex-col bg-white border-r border-gray-200 shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold text-gray-900">재고 관리</h1>
            <div className="flex gap-2">
              {role === 'admin' && (
                <button
                  onClick={handleDriveSetup}
                  title="Drive 저장 위치 설정"
                  className="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                >
                  ⚙️ 저장 위치
                </button>
              )}
              <button
                onClick={() => setShowAddModal(true)}
                className="text-xs px-3 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
              >
                + 추가
              </button>
            </div>
          </div>

          {inventoryFolder ? (
            <div className="text-xs text-green-600 bg-green-50 rounded-lg px-2 py-1 mb-2 flex items-center gap-1">
              <span>📁</span>
              <span className="truncate">{inventoryFolder.name}</span>
            </div>
          ) : (
            role === 'admin' && (
              <div className="text-xs text-amber-600 bg-amber-50 rounded-lg px-2 py-1 mb-2">
                ⚠ 수령/반납 사진 저장을 위해 Drive 저장 위치를 설정해주세요
              </div>
            )
          )}

          <input
            type="text"
            placeholder="아이템 검색..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
          />

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

        {/* Item list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {loading ? (
            <div className="text-center text-gray-400 text-sm py-8">불러오는 중...</div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-8">항목 없음</div>
          ) : (
            filteredItems.map(item => {
              const cfg = CATEGORY_CONFIG[item.category]
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
                  </div>
                  <div className="ml-4 flex items-center justify-between mt-0.5">
                    <span className="text-xs text-gray-400">{cfg.label}</span>
                    <span className="text-xs font-semibold text-gray-700">
                      {item.current_qty} {item.unit}
                    </span>
                  </div>
                </button>
              )
            })
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
            </div>

            {/* Edit form — 기본정보는 admin만 수정 가능 (P1-19) */}
            <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">기본 정보</h3>
                {role !== 'admin' && (
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">읽기 전용</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">아이템명</label>
                  {role === 'admin' ? (
                    <input
                      value={editForm.item_name}
                      onChange={e => setEditForm(f => ({ ...f, item_name: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <p className="px-3 py-2 text-sm text-gray-800 bg-gray-50 rounded-lg">{editForm.item_name}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">카테고리</label>
                  {role === 'admin' ? (
                    <select
                      value={editForm.category}
                      onChange={e => setEditForm(f => ({ ...f, category: e.target.value as InventoryCategory }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="chemical">약품</option>
                      <option value="equipment">장비</option>
                      <option value="consumable">소모품</option>
                      <option value="other">기타</option>
                    </select>
                  ) : (
                    <p className="px-3 py-2 text-sm text-gray-800 bg-gray-50 rounded-lg">
                      {CATEGORY_CONFIG[editForm.category].label}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">단위</label>
                  {role === 'admin' ? (
                    <input
                      value={editForm.unit}
                      onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <p className="px-3 py-2 text-sm text-gray-800 bg-gray-50 rounded-lg">{editForm.unit}</p>
                  )}
                </div>
              </div>
              {role === 'admin' && (
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
              )}
            </div>

            {/* Current stock & transactions */}
            <div className="bg-white rounded-xl shadow-sm p-5">
              <div className="mb-4">
                <h3 className="font-semibold text-gray-800">현재 재고</h3>
                <p className="text-3xl font-bold mt-1 text-gray-900">
                  {selectedItem.current_qty}
                  <span className="text-base font-normal text-gray-500 ml-1">{selectedItem.unit}</span>
                </p>
                <p className="text-xs text-gray-400 mt-0.5">수량은 0.1 단위로 입력할 수 있습니다</p>
              </div>

              <div className="grid grid-cols-4 gap-2 mb-3">
                {(['receive', 'use', 'return', 'adjust'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => openTxModal(type)}
                    className={`py-2.5 rounded-lg text-sm font-medium transition-colors border ${TX_BUTTON_STYLE[type]}`}
                  >
                    <div>{TX_LABELS[type]}</div>
                    <div className="text-xs opacity-60 mt-0.5">{TX_EFFECT[type]}</div>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {(['receive', 'use', 'return', 'adjust'] as const).map(type => (
                  <div key={type} className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                    <span className="font-medium text-gray-700">{TX_LABELS[type]}</span>
                    <span className="mx-1">·</span>
                    {TX_DESCRIPTIONS[type]}
                    {PHOTO_REQUIRED.includes(type) && (
                      <span className="ml-1 text-red-500 font-medium">사진 필수</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Transaction history */}
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 mb-3">변동 내역 (최근 20건)</h3>
              {logsLoading ? (
                <div className="text-center text-gray-400 text-sm py-4">불러오는 중...</div>
              ) : logs.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-4">변동 내역이 없습니다</div>
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
                          log.change_type === 'use'     ? 'bg-orange-100 text-orange-700' :
                          log.change_type === 'return'  ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {TX_LABELS[log.change_type]}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-800">
                              {log.change_type === 'receive' || log.change_type === 'return' ? '+' :
                               log.change_type === 'use' ? '−' : '='}{log.quantity}
                            </span>
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
                          {new Date(log.created_at).toLocaleDateString('ko-KR', {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                          })}
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
                  value={addForm.item_name}
                  onChange={e => setAddForm(f => ({ ...f, item_name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="예: 에탄올 70%"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">카테고리 *</label>
                  <select
                    value={addForm.category}
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
                    value={addForm.unit}
                    onChange={e => setAddForm(f => ({ ...f, unit: e.target.value }))}
                    placeholder="예: L, 개, kg"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">초기 수량</label>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={addForm.current_qty}
                  onChange={e => setAddForm(f => ({ ...f, current_qty: Number(e.target.value) }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">0.1 단위로 입력 가능합니다</p>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { setShowAddModal(false); setAddForm({ item_name: '', category: 'chemical', unit: '', current_qty: 0 }) }}
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

      {/* Transaction Modal — outside the two-panel wrapper but inside the ternary block */}
      {showTxModal && selectedItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">{TX_LABELS[txType]}</h2>
            <p className="text-sm text-gray-500 mb-1">
              {selectedItem.item_name} · 현재 {selectedItem.current_qty}{selectedItem.unit}
            </p>

            <div className={`text-xs rounded-lg px-3 py-2 mb-4 ${
              txType === 'receive' ? 'bg-green-50 text-green-700' :
              txType === 'use'     ? 'bg-orange-50 text-orange-700' :
              txType === 'return'  ? 'bg-blue-50 text-blue-700' :
              'bg-gray-50 text-gray-600'
            }`}>
              {TX_DESCRIPTIONS[txType]}
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  {txType === 'adjust' ? '새 재고 수량 (절대값)' : '수량'} · 0.1 단위 입력 가능
                </label>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={txQty}
                  onChange={e => setTxQty(e.target.value)}
                  placeholder="0.0"
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

              {/* 사진 (수령/반납 필수) */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  사진
                  {needsPhoto && <span className="text-red-500 ml-1">*필수</span>}
                </label>

                {!inventoryFolder && (
                  <p className="text-xs text-red-500 bg-red-50 rounded-lg px-2 py-1.5 mb-2">
                    Drive 저장 위치가 설정되지 않았습니다.
                    {role === 'admin' ? ' ⚙️ 저장 위치 버튼에서 설정해주세요.' : ' 관리자에게 문의해주세요.'}
                  </p>
                )}

                <label className={`flex items-center gap-2 cursor-pointer ${!inventoryFolder ? 'opacity-50 pointer-events-none' : ''}`}>
                  <span className="px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-600 hover:bg-gray-100 transition-colors">
                    📷 사진 촬영 / 선택
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoCapture}
                    className="hidden"
                    disabled={!inventoryFolder}
                  />
                  {txPhoto && <span className="text-xs text-green-600">✓ {txPhoto.name}</span>}
                </label>

                {txPhotoPreview && (
                  <img src={txPhotoPreview} alt="미리보기" className="mt-2 w-full h-32 object-cover rounded-lg" />
                )}

                {needsPhoto && !txPhoto && inventoryFolder && (
                  <p className="text-xs text-red-500 mt-1">사진을 첨부해야 저장할 수 있습니다.</p>
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
                disabled={txLoading || !canSubmit}
                className={`flex-1 py-2 rounded-xl text-white text-sm font-medium transition-colors disabled:opacity-50 ${
                  txType === 'receive' ? 'bg-green-600 hover:bg-green-700' :
                  txType === 'use'     ? 'bg-orange-500 hover:bg-orange-600' :
                  txType === 'return'  ? 'bg-blue-600 hover:bg-blue-700' :
                  'bg-gray-600 hover:bg-gray-700'
                }`}
              >
                {txLoading ? '처리 중...' : '확인'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
      )}
    </div>
  )
}
