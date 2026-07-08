'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'
import ImportSheetModal from '@/components/admin/ImportSheetModal'
import { BarChart2, Download, Save } from 'lucide-react'
import { getExpenseTypes, UNCLASSIFIED, EXPENSE_TYPE_COLORS } from '@/lib/finance-types'
// ─── Types ────────────────────────────────────────────────────────────────────

interface RevenueItem {
  id: string
  business_name: string
  service_type: string | null
  construction_date: string | null
  supply_amount: number | null
  vat: number | null
  payment_method: string | null
  total: number
}

interface FinanceRecord {
  id: string
  year_month: string
  category: 'fixed' | 'variable'
  name: string
  amount: number
  note: string | null
  group_name: string | null
}

interface FinanceData {
  revenue: { total: number; items: RevenueItem[] }
  labor: { total: number; records: unknown[] }
  fixed: { total: number; records: FinanceRecord[] }
  variable: { total: number; records: FinanceRecord[] }
  net_profit: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString('ko-KR')
const fmtDate = (d: string | null) => d ? d.slice(0, 10).replace(/-/g, '.') : '-'

function currentYM() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function Bar({ value, total, color }: { value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-surface-sunken rounded-full h-2">
        <div className={`h-2 rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-text-secondary w-8 text-right">{pct}%</span>
    </div>
  )
}

// 항목별 구성: 매입 유형(group_name) 기준으로 합산 → 1줄 stacked bar + legend
const FALLBACK_PALETTE = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
  '#eab308', '#22c55e', '#10b981', '#14b8a6', '#06b6d4',
]

function StackedComposition({ records }: { records: { id: string; group_name: string | null; amount: number }[] }) {
  const total = records.reduce((s, r) => s + Number(r.amount), 0)
  if (total === 0 || records.length === 0) return null

  // group_name 기준 합산
  const byGroup = new Map<string, number>()
  for (const r of records) {
    const key = r.group_name && r.group_name.trim() ? r.group_name : UNCLASSIFIED
    byGroup.set(key, (byGroup.get(key) ?? 0) + Number(r.amount))
  }
  const grouped = Array.from(byGroup.entries())
    .map(([group, amount], i) => ({
      group,
      amount,
      color: EXPENSE_TYPE_COLORS[group] ?? FALLBACK_PALETTE[i % FALLBACK_PALETTE.length],
    }))
    .sort((a, b) => b.amount - a.amount)

  return (
    <div>
      {/* Stacked bar — 한 줄에 모든 유형 비율 */}
      <div className="flex h-7 rounded-md overflow-hidden bg-surface-sunken border border-border-subtle">
        {grouped.map(g => {
          const pct = (g.amount / total) * 100
          return (
            <div
              key={g.group}
              style={{ width: `${pct}%`, backgroundColor: g.color }}
              title={`${g.group} · ${g.amount.toLocaleString('ko-KR')}원 · ${pct.toFixed(1)}%`}
              className="hover:brightness-110 transition-all flex items-center justify-center text-white text-[10px] font-bold overflow-hidden"
            >
              {pct >= 8 && <span className="px-1 truncate">{pct.toFixed(0)}%</span>}
            </div>
          )
        })}
      </div>

      {/* Legend — 색 · 유형 · 금액 · 퍼센트 */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {grouped.map(g => {
          const pct = (g.amount / total) * 100
          return (
            <div key={g.group} className="flex items-center gap-1 text-[11px]">
              <span style={{ backgroundColor: g.color }} className="w-2.5 h-2.5 rounded-sm shrink-0" />
              <span className="text-text-secondary">{g.group}</span>
              <span className="text-text-tertiary font-mono">{g.amount.toLocaleString('ko-KR')}원</span>
              <span className="text-text-tertiary">({pct.toFixed(1)}%)</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── AddItemForm ──────────────────────────────────────────────────────────────

function AddItemForm({ onAdd }: { onAdd: (name: string, amount: string, note: string) => Promise<void> }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [adding, setAdding] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim() || !amount) return
    setAdding(true)
    await onAdd(name.trim(), amount, note.trim())
    setName(''); setAmount(''); setNote('')
    setAdding(false)
  }

  return (
    <div className="flex gap-2 mt-3">
      <input value={name} onChange={e => setName(e.target.value)}
        placeholder="항목명" className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
        placeholder="금액" className="w-28 border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <input value={note} onChange={e => setNote(e.target.value)}
        placeholder="메모" className="w-24 border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <Button onClick={handleSubmit} disabled={adding || !name.trim() || !amount} size="sm">
        {adding ? '...' : '+ 추가'}
      </Button>
    </div>
  )
}

// ─── RecordRow ────────────────────────────────────────────────────────────────

function RecordRow({ record, isSelected, onToggle, isEditing, onSave, onCancelEdit, currentGroup, isDirtyGroup, onChangeGroup }: {
  record: FinanceRecord
  isSelected: boolean
  onToggle: (id: string) => void
  isEditing: boolean
  onSave: (id: string, name: string, amount: string, note: string) => Promise<void>
  onCancelEdit: () => void
  currentGroup: string
  isDirtyGroup: boolean
  onChangeGroup: (id: string, group: string) => void
}) {
  const [name, setName] = useState(record.name)
  const [amount, setAmount] = useState(String(record.amount))
  const [note, setNote] = useState(record.note ?? '')
  const [saving, setSaving] = useState(false)

  // 편집 모드 진입 시 최신 값으로 초기화
  useEffect(() => {
    if (isEditing) {
      setName(record.name)
      setAmount(String(record.amount))
      setNote(record.note ?? '')
    }
  }, [isEditing, record.name, record.amount, record.note])

  const handleSave = async () => {
    setSaving(true)
    await onSave(record.id, name, amount, note)
    setSaving(false)
  }

  if (isEditing) {
    return (
      <div className="flex gap-2 items-center py-2 border-b border-border-subtle last:border-0 bg-brand-50 px-2 -mx-2 rounded-lg">
        <input value={name} onChange={e => setName(e.target.value)}
          className="flex-1 border border-brand-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500" />
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
          className="w-24 border border-brand-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500" />
        <input value={note} onChange={e => setNote(e.target.value)}
          placeholder="메모"
          className="w-20 border border-brand-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500" />
        <Button onClick={handleSave} disabled={saving} size="sm">저장</Button>
        <Button variant="ghost" onClick={onCancelEdit} size="sm">취소</Button>
      </div>
    )
  }

  const types = getExpenseTypes(record.category)
  const groupColor = EXPENSE_TYPE_COLORS[currentGroup]
  const isUnclassified = currentGroup === UNCLASSIFIED

  return (
    <div
      className={`flex items-center gap-2 py-2 border-b border-border-subtle last:border-0 cursor-pointer transition-colors ${isSelected ? 'bg-brand-50' : 'hover:bg-surface-sunken'}`}
      onClick={() => onToggle(record.id)}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onToggle(record.id)}
        onClick={e => e.stopPropagation()}
        className="rounded flex-shrink-0 accent-brand-600"
      />
      <span className="flex-1 text-sm text-text-primary truncate">{record.name}</span>
      {record.note && <span className="text-xs text-text-tertiary truncate max-w-[80px]">{record.note}</span>}
      <select
        value={currentGroup}
        onClick={e => e.stopPropagation()}
        onChange={e => onChangeGroup(record.id, e.target.value)}
        className={`text-[11px] px-1.5 py-0.5 rounded-md border font-medium max-w-[110px] shrink-0 ${
          isDirtyGroup
            ? 'border-amber-400 bg-amber-50 text-amber-800'
            : isUnclassified
              ? 'border-border bg-surface-sunken text-text-secondary'
              : 'border-transparent'
        }`}
        style={!isUnclassified && !isDirtyGroup && groupColor
          ? { backgroundColor: `${groupColor}15`, color: groupColor }
          : undefined}
      >
        {types.map(t => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <span className="text-sm font-semibold text-text-primary font-mono whitespace-nowrap">{fmt(record.amount)}원</span>
    </div>
  )
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SERVICE_TYPES = ['1회성케어', '정기딥케어', '정기딥케어(연간)', '정기엔드케어'] as const

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FinancePage() {
  const [month, setMonth] = useState(currentYM)
  // 매출/매입 탭 (대시보드는 /admin/finance에 통합)
  const [section, setSection] = useState<'revenue' | 'expense'>('revenue')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<FinanceData | null>(null)
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [purchaseSortDir, setPurchaseSortDir] = useState<'asc' | 'desc'>('asc')
  // 매출 항목 정렬 (기본은 정렬 안 함)
  const [revenueSort, setRevenueSort] = useState<'none' | 'desc' | 'asc'>('none')
  const [showImportModal, setShowImportModal] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  // 유형 편집 로컬 state (id → group_name). 서버 값과 다른 항목만 저장 대상.
  const [pendingGroups, setPendingGroups] = useState<Record<string, string>>({})
  const [savingGroups, setSavingGroups] = useState<'fixed' | 'variable' | null>(null)

  const displayMonth = (() => {
    const [y, m] = month.split('-')
    return `${y}년 ${Number(m)}월`
  })()

  const fetchData = useCallback(async () => {
    setLoading(true)
    setSelectedIds(new Set())
    setEditingId(null)
    setPendingGroups({})
    try {
      const res = await fetch(`/api/admin/finance?month=${month}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '불러오기 실패')
      setData(json)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '데이터 불러오기 실패')
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => { fetchData() }, [fetchData])

  const prevMonth = () => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const nextMonth = () => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const handleAddRecord = async (category: 'fixed' | 'variable', name: string, amount: string, note: string) => {
    try {
      const res = await fetch('/api/admin/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year_month: month, category, name, amount: Number(amount), note: note || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success('추가되었습니다.')
      await fetchData()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '추가 실패')
    }
  }

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const toggleSelectAll = (records: FinanceRecord[], checked: boolean) =>
    setSelectedIds(prev => {
      const next = new Set(prev)
      records.forEach(r => checked ? next.add(r.id) : next.delete(r.id))
      return next
    })

  const handleBulkDelete = async (ids: string[]) => {
    if (ids.length === 0) return
    if (!confirm(`선택한 ${ids.length}건을 삭제하시겠습니까?`)) return
    try {
      await Promise.all(ids.map(id => fetch(`/api/admin/finance?id=${id}`, { method: 'DELETE' })))
      toast.success(`${ids.length}건 삭제되었습니다.`)
      await fetchData()
    } catch {
      toast.error('삭제 중 오류가 발생했습니다.')
    }
  }

  const handleUpdateRecord = async (id: string, name: string, amount: string, note: string) => {
    try {
      const res = await fetch('/api/admin/finance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, amount: Number(amount), note: note || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success('수정되었습니다.')
      await fetchData()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '수정 실패')
    }
  }

  // 유형 드롭다운 변경 (로컬 state 만 업데이트)
  const handleChangeGroup = (id: string, group: string) => {
    setPendingGroups(prev => ({ ...prev, [id]: group }))
  }

  // 특정 카테고리의 변경된 유형만 일괄 저장 → 저장된 매핑은 다음 임포트/추가 시 자동 적용됨
  const handleSaveGroups = async (category: 'fixed' | 'variable') => {
    if (!data) return
    const records = category === 'fixed' ? data.fixed.records : data.variable.records
    const updates = records
      .filter(r => {
        const pending = pendingGroups[r.id]
        if (pending === undefined) return false
        const current = r.group_name ?? UNCLASSIFIED
        return pending !== current
      })
      .map(r => ({
        id: r.id,
        category,
        name: r.name,
        group_name: pendingGroups[r.id],
      }))

    if (updates.length === 0) {
      toast('변경된 항목이 없습니다.', { icon: 'ℹ️' })
      return
    }

    setSavingGroups(category)
    try {
      const res = await fetch('/api/admin/finance/bulk-group', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(`${updates.length}건 유형 저장되었습니다.`)
      await fetchData()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '유형 저장 실패')
    } finally {
      setSavingGroups(null)
    }
  }

  // 특정 record 의 표시 group (pending 이 있으면 그것, 없으면 서버 값, 그것도 없으면 미분류)
  const getDisplayGroup = (r: FinanceRecord): string =>
    pendingGroups[r.id] ?? r.group_name ?? UNCLASSIFIED
  const isDirtyGroup = (r: FinanceRecord): boolean => {
    const pending = pendingGroups[r.id]
    if (pending === undefined) return false
    return pending !== (r.group_name ?? UNCLASSIFIED)
  }

  const dirtyCount = (cat: 'fixed' | 'variable'): number => {
    if (!data) return 0
    const records = cat === 'fixed' ? data.fixed.records : data.variable.records
    return records.filter(r => isDirtyGroup(r)).length
  }

  const downloadSheet = () => {
    if (!data) return
    const rows: string[][] = []
    rows.push([`${displayMonth} 매출매입 현황`])
    rows.push([])
    rows.push(['구분', '항목', '금액', '메모'])
    rows.push(['매출합계', '', String(data.revenue.total), ''])
    for (const item of data.revenue.items) {
      rows.push(['매출', `${fmtDate(item.construction_date)} ${item.business_name}`, String(item.total), item.service_type ?? ''])
    }
    rows.push([])
    rows.push(['인건비합계', '', String(data.labor.total), '자동산정'])
    rows.push([])
    rows.push(['고정비합계', '', String(data.fixed.total), ''])
    for (const r of data.fixed.records) rows.push(['고정비', r.name, String(r.amount), r.note ?? ''])
    rows.push([])
    rows.push(['변동비합계', '', String(data.variable.total), ''])
    for (const r of data.variable.records) rows.push(['변동비', r.name, String(r.amount), r.note ?? ''])
    rows.push([])
    rows.push(['순이익', '', String(data.net_profit), '매출-인건비-고정비-변동비'])

    const csv = '\uFEFF' + rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `매출매입_${displayMonth}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const toggleServiceType = (type: string) => {
    setSelectedTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    )
  }

  const filteredRevenue = !data ? [] : selectedTypes.length === 0
    ? data.revenue.items
    : data.revenue.items.filter(item => selectedTypes.includes(item.service_type ?? ''))

  // 금액 정렬 적용 (none = 기본순서 유지)
  const sortedRevenue = revenueSort === 'none'
    ? filteredRevenue
    : [...filteredRevenue].sort((a, b) =>
        revenueSort === 'desc' ? b.total - a.total : a.total - b.total
      )

  const sortRecords = (records: FinanceRecord[]) =>
    [...records].sort((a, b) =>
      purchaseSortDir === 'asc'
        ? a.name.localeCompare(b.name, 'ko')
        : b.name.localeCompare(a.name, 'ko')
    )

  // totalExpense / profitRate 변수는 대시보드 영역 제거로 함께 삭제 (재무 대시보드에서 표시)

  return (
    <div className="flex flex-col h-full">
      {showImportModal && (
        <ImportSheetModal
          month={month}
          onClose={() => setShowImportModal(false)}
          onImported={() => { setShowImportModal(false); fetchData() }}
        />
      )}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {/* 월 선택기 */}
        <div className="flex items-center justify-between my-4">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-surface-sunken text-text-secondary transition-colors">‹</button>
          <div className="text-center">
            <h2 className="text-base font-bold text-text-primary">{displayMonth}</h2>
            <p className="text-xs text-text-tertiary">매출매입 현황</p>
          </div>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-surface-sunken text-text-secondary transition-colors">›</button>
        </div>

        {/* 매출 / 매입 탭 + 시트 만들기 */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex gap-1 bg-surface-sunken rounded-xl p-1 flex-1">
            <button
              onClick={() => setSection('revenue')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${section === 'revenue' ? 'bg-surface text-text-primary shadow-soft' : 'text-text-secondary'}`}
            >
              매출
            </button>
            <button
              onClick={() => setSection('expense')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${section === 'expense' ? 'bg-surface text-text-primary shadow-soft' : 'text-text-secondary'}`}
            >
              매입
            </button>
          </div>
          <Button onClick={downloadSheet} disabled={!data} size="sm" className="bg-emerald-600 hover:bg-emerald-700 whitespace-nowrap">
            <BarChart2 size={14} className="inline mr-1" />시트 만들기
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12"><p className="text-sm text-text-tertiary">불러오는 중...</p></div>
        ) : !data ? null : (

          /* ── 상세내역 ── */
          <div className="space-y-4">

            {/* 카드내역 불러오기 — 매입 탭에서만 표시 (변동비 일괄 입력용) */}
            {section === 'expense' && (
              <div className="flex justify-end">
                <Button
                  onClick={() => setShowImportModal(true)}
                  size="sm"
                  className="bg-violet-600 hover:bg-violet-700"
                >
                  <Download size={14} className="inline mr-1" />카드내역 불러오기
                </Button>
              </div>
            )}

            {/* 매출 섹션 — 매출 탭에서만 표시 */}
            {section === 'revenue' && (
            <div className="bg-surface border border-border-subtle rounded-xl overflow-hidden max-w-2xl mx-auto w-full">
              {/* 헤더 (컴팩트) */}
              <div className="px-3 py-2 bg-brand-50 border-b border-brand-100 flex items-center justify-between gap-2">
                <div className="min-w-0 flex items-baseline gap-1.5">
                  <span className="text-xs font-bold text-brand-700">매출</span>
                  <span className="text-[10px] text-brand-500">자동산정</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setRevenueSort(prev => prev === 'none' ? 'desc' : prev === 'desc' ? 'asc' : 'none')}
                    title="금액 정렬"
                    className="text-[11px] text-brand-600 hover:text-brand-700 hover:underline font-medium"
                  >
                    금액 {revenueSort === 'desc' ? '↓' : revenueSort === 'asc' ? '↑' : '⇅'}
                  </button>
                  <span className="text-xs font-bold text-brand-700 font-mono">{fmt(filteredRevenue.reduce((s, i) => s + i.total, 0))}원</span>
                </div>
              </div>

              {/* 서비스 유형 필터 칩 (컴팩트) */}
              <div className="px-3 py-1.5 flex gap-1 flex-wrap border-b border-border-subtle bg-surface-sunken">
                {SERVICE_TYPES.map(type => (
                  <button
                    key={type}
                    onClick={() => toggleServiceType(type)}
                    className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                      selectedTypes.includes(type)
                        ? 'bg-brand-600 text-white'
                        : 'bg-surface border border-border text-text-secondary hover:border-blue-400'
                    }`}
                  >
                    {type}
                  </button>
                ))}
                {selectedTypes.length > 0 && (
                  <button onClick={() => setSelectedTypes([])} className="px-1.5 py-0.5 text-[11px] text-text-tertiary hover:text-text-secondary">
                    전체
                  </button>
                )}
                <span className="ml-auto text-[11px] text-text-tertiary self-center">{filteredRevenue.length}건</span>
              </div>

              {/* 서비스 유형별 소계 */}
              {filteredRevenue.length > 0 && (
                <div className="px-3 py-1 flex gap-x-3 gap-y-0.5 flex-wrap border-b border-border-subtle bg-blue-50">
                  {Object.entries(
                    filteredRevenue.reduce<Record<string, { total: number; count: number }>>((acc, item) => {
                      const key = item.service_type ?? '미분류'
                      if (!acc[key]) acc[key] = { total: 0, count: 0 }
                      acc[key].total += item.total
                      acc[key].count += 1
                      return acc
                    }, {})
                  )
                    .sort((a, b) => b[1].total - a[1].total)
                    .map(([type, { total, count }]) => (
                      <span key={type} className="text-[11px] whitespace-nowrap">
                        <span className="text-text-secondary">{type}</span>
                        <span className="text-text-tertiary mx-0.5">{count}</span>
                        <span className="font-semibold text-brand-700 font-mono">{fmt(total)}원</span>
                      </span>
                    ))}
                </div>
              )}

              {/* 항목 리스트 (컴팩트) */}
              <div className="divide-y divide-border-subtle">
                {filteredRevenue.length === 0 ? (
                  <p className="text-[11px] text-text-tertiary text-center py-3">
                    {selectedTypes.length > 0 ? '선택한 유형의 매출 없음' : `${displayMonth} 매출 없음`}
                  </p>
                ) : sortedRevenue.map(item => (
                  <div key={item.id} className="px-3 py-1.5 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-text-primary truncate leading-tight">{item.business_name}</p>
                      <p className="text-[10px] text-text-tertiary leading-tight">{fmtDate(item.construction_date)} · {item.service_type} · {item.payment_method ?? '-'}</p>
                    </div>
                    <span className="text-xs font-semibold text-brand-600 font-mono whitespace-nowrap">{fmt(item.total)}원</span>
                  </div>
                ))}
              </div>
            </div>

            )}

            {/* 매입 섹션 — 매입 탭에서만 표시 (인건비 + 고정비 + 변동비) */}
            {section === 'expense' && <>

            {/* 인건비 */}
            <div className="bg-surface border border-border-subtle rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-orange-50 border-b border-orange-100 flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-orange-800">인건비</span>
                  <span className="text-xs text-orange-500 ml-2">급여정산 자동산정</span>
                </div>
                <span className="text-sm font-bold text-orange-700 font-mono">{fmt(data.labor.total)}원</span>
              </div>
              <div className="px-4 py-3">
                {data.labor.records.length === 0 ? (
                  <p className="text-xs text-text-tertiary text-center py-2">{displayMonth} 급여정산 데이터 없음</p>
                ) : (
                  <p className="text-xs text-text-secondary">{data.labor.records.length}명 합계 (담당자+작업자 최종지급액 기준)</p>
                )}
              </div>
            </div>

            {/* 고정비 */}
            {(() => {
              const fixedSelected = data.fixed.records.filter(r => selectedIds.has(r.id))
              return (
                <div className="bg-surface border border-border-subtle rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
                    <div>
                      <span className="text-sm font-bold text-indigo-800">고정비</span>
                      <span className="text-xs text-indigo-400 ml-2">임대료, 보험료 등</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPurchaseSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                        title={purchaseSortDir === 'asc' ? '이름 오름차순' : '이름 내림차순'}
                        className="text-xs text-indigo-500 hover:text-indigo-700 font-medium flex items-center gap-0.5"
                      >
                        이름 {purchaseSortDir === 'asc' ? '↑' : '↓'}
                      </button>
                      <span className="text-sm font-bold text-indigo-700 font-mono">{fmt(data.fixed.total)}원</span>
                    </div>
                  </div>
                  {data.fixed.records.length > 0 && data.fixed.total > 0 && (
                    <div className="px-4 py-3 border-b border-indigo-100 bg-indigo-50/30">
                      <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wide mb-2">항목별 구성</p>
                      <StackedComposition records={data.fixed.records} />
                    </div>
                  )}
                  {data.fixed.records.length > 0 && (
                    <div className="px-4 py-2 border-b border-border-subtle flex items-center gap-3 bg-surface-sunken">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={data.fixed.records.length > 0 && data.fixed.records.every(r => selectedIds.has(r.id))}
                          onChange={e => toggleSelectAll(data.fixed.records, e.target.checked)}
                          className="rounded accent-indigo-600"
                        />
                        <span className="text-xs text-text-secondary">전체 선택</span>
                      </label>
                      {fixedSelected.length > 0 && (
                        <>
                          <span className="text-xs text-indigo-600 font-medium">{fixedSelected.length}건 선택</span>
                          <div className="ml-auto flex items-center gap-2">
                            {fixedSelected.length === 1 && (
                              <Button size="sm" variant="ghost" onClick={() => setEditingId(fixedSelected[0].id)}>
                                수정
                              </Button>
                            )}
                            <Button
                              size="sm"
                              onClick={() => handleBulkDelete(fixedSelected.map(r => r.id))}
                              className="bg-red-500 hover:bg-red-600 text-white"
                            >
                              삭제 ({fixedSelected.length}건)
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  <div className="px-4 py-2">
                    {sortRecords(data.fixed.records).map(r => (
                      <RecordRow key={r.id} record={r}
                        isSelected={selectedIds.has(r.id)}
                        onToggle={toggleSelect}
                        isEditing={editingId === r.id}
                        onSave={handleUpdateRecord}
                        onCancelEdit={() => setEditingId(null)}
                        currentGroup={getDisplayGroup(r)}
                        isDirtyGroup={isDirtyGroup(r)}
                        onChangeGroup={handleChangeGroup} />
                    ))}
                    {data.fixed.records.length === 0 && (
                      <p className="text-xs text-text-tertiary text-center py-3">항목 없음</p>
                    )}
                    <AddItemForm onAdd={(name, amount, note) => handleAddRecord('fixed', name, amount, note)} />
                    {/* 유형 일괄 저장 — 저장된 매핑은 다음 임포트/추가 시 자동 적용 */}
                    {data.fixed.records.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border-subtle flex justify-end">
                        <Button
                          onClick={() => handleSaveGroups('fixed')}
                          disabled={savingGroups === 'fixed' || dirtyCount('fixed') === 0}
                          size="sm"
                          className={dirtyCount('fixed') > 0 ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : ''}
                        >
                          <Save size={13} className="inline mr-1" />
                          {savingGroups === 'fixed' ? '저장 중...' : `유형 일괄 저장${dirtyCount('fixed') > 0 ? ` (${dirtyCount('fixed')}건)` : ''}`}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* 변동비 */}
            {(() => {
              const variableSelected = data.variable.records.filter(r => selectedIds.has(r.id))
              return (
                <div className="bg-surface border border-border-subtle rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-purple-50 border-b border-purple-100 flex items-center justify-between">
                    <div>
                      <span className="text-sm font-bold text-purple-800">변동비</span>
                      <span className="text-xs text-purple-400 ml-2">소모품, 교통비 등</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPurchaseSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                        title={purchaseSortDir === 'asc' ? '이름 오름차순' : '이름 내림차순'}
                        className="text-xs text-purple-500 hover:text-purple-700 font-medium flex items-center gap-0.5"
                      >
                        이름 {purchaseSortDir === 'asc' ? '↑' : '↓'}
                      </button>
                      <span className="text-sm font-bold text-purple-700 font-mono">{fmt(data.variable.total)}원</span>
                    </div>
                  </div>
                  {data.variable.records.length > 0 && data.variable.total > 0 && (
                    <div className="px-4 py-3 border-b border-purple-100 bg-purple-50/30">
                      <p className="text-xs font-semibold text-purple-400 uppercase tracking-wide mb-2">항목별 구성</p>
                      <StackedComposition records={data.variable.records} />
                    </div>
                  )}
                  {data.variable.records.length > 0 && (
                    <div className="px-4 py-2 border-b border-border-subtle flex items-center gap-3 bg-surface-sunken">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={data.variable.records.length > 0 && data.variable.records.every(r => selectedIds.has(r.id))}
                          onChange={e => toggleSelectAll(data.variable.records, e.target.checked)}
                          className="rounded accent-purple-600"
                        />
                        <span className="text-xs text-text-secondary">전체 선택</span>
                      </label>
                      {variableSelected.length > 0 && (
                        <>
                          <span className="text-xs text-purple-600 font-medium">{variableSelected.length}건 선택</span>
                          <div className="ml-auto flex items-center gap-2">
                            {variableSelected.length === 1 && (
                              <Button size="sm" variant="ghost" onClick={() => setEditingId(variableSelected[0].id)}>
                                수정
                              </Button>
                            )}
                            <Button
                              size="sm"
                              onClick={() => handleBulkDelete(variableSelected.map(r => r.id))}
                              className="bg-red-500 hover:bg-red-600 text-white"
                            >
                              삭제 ({variableSelected.length}건)
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  <div className="px-4 py-2">
                    {sortRecords(data.variable.records).map(r => (
                      <RecordRow key={r.id} record={r}
                        isSelected={selectedIds.has(r.id)}
                        onToggle={toggleSelect}
                        isEditing={editingId === r.id}
                        onSave={handleUpdateRecord}
                        onCancelEdit={() => setEditingId(null)}
                        currentGroup={getDisplayGroup(r)}
                        isDirtyGroup={isDirtyGroup(r)}
                        onChangeGroup={handleChangeGroup} />
                    ))}
                    {data.variable.records.length === 0 && (
                      <p className="text-xs text-text-tertiary text-center py-3">항목 없음</p>
                    )}
                    <AddItemForm onAdd={(name, amount, note) => handleAddRecord('variable', name, amount, note)} />
                    {/* 유형 일괄 저장 — 저장된 매핑은 다음 임포트/추가 시 자동 적용 */}
                    {data.variable.records.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border-subtle flex justify-end">
                        <Button
                          onClick={() => handleSaveGroups('variable')}
                          disabled={savingGroups === 'variable' || dirtyCount('variable') === 0}
                          size="sm"
                          className={dirtyCount('variable') > 0 ? 'bg-purple-600 hover:bg-purple-700 text-white' : ''}
                        >
                          <Save size={13} className="inline mr-1" />
                          {savingGroups === 'variable' ? '저장 중...' : `유형 일괄 저장${dirtyCount('variable') > 0 ? ` (${dirtyCount('variable')}건)` : ''}`}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

            </>}
            {/* 매입 섹션 (expense fragment) 닫기 */}

          </div>
        )}
      </div>
    </div>
  )
}
