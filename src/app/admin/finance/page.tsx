'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'

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
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className={`h-2 rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
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
        placeholder="항목명" className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
        placeholder="금액" className="w-28 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <input value={note} onChange={e => setNote(e.target.value)}
        placeholder="메모" className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <button onClick={handleSubmit} disabled={adding || !name.trim() || !amount}
        className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">
        {adding ? '...' : '+ 추가'}
      </button>
    </div>
  )
}

// ─── RecordRow ────────────────────────────────────────────────────────────────

function RecordRow({ record, onDelete, onUpdate }: {
  record: FinanceRecord
  onDelete: (id: string) => void
  onUpdate: (id: string, name: string, amount: string, note: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(record.name)
  const [amount, setAmount] = useState(String(record.amount))
  const [note, setNote] = useState(record.note ?? '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await onUpdate(record.id, name, amount, note)
    setSaving(false)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex gap-2 items-center py-2 border-b border-gray-50 last:border-0">
        <input value={name} onChange={e => setName(e.target.value)}
          className="flex-1 border border-blue-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
          className="w-28 border border-blue-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
        <input value={note} onChange={e => setNote(e.target.value)}
          className="w-24 border border-blue-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
        <button onClick={handleSave} disabled={saving}
          className="text-xs bg-blue-600 text-white px-2 py-1 rounded-lg disabled:opacity-50">저장</button>
        <button onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-600">취소</button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 py-2 border-b border-gray-50 last:border-0 group">
      <span className="flex-1 text-sm text-gray-800">{record.name}</span>
      {record.note && <span className="text-xs text-gray-400 truncate max-w-[80px]">{record.note}</span>}
      <span className="text-sm font-semibold text-gray-700 font-mono whitespace-nowrap">{fmt(record.amount)}원</span>
      <button onClick={() => setEditing(true)}
        className="text-xs text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">✏️</button>
      <button onClick={() => onDelete(record.id)}
        className="text-xs text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FinancePage() {
  const [month, setMonth] = useState(currentYM)
  const [tab, setTab] = useState<'dashboard' | 'detail'>('dashboard')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<FinanceData | null>(null)

  const displayMonth = (() => {
    const [y, m] = month.split('-')
    return `${y}년 ${Number(m)}월`
  })()

  const fetchData = useCallback(async () => {
    setLoading(true)
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

  const handleDeleteRecord = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/finance?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('삭제 실패')
      toast.success('삭제되었습니다.')
      await fetchData()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '삭제 실패')
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

  const totalExpense = data ? data.labor.total + data.fixed.total + data.variable.total : 0
  const profitRate = data && data.revenue.total > 0 ? Math.round((data.net_profit / data.revenue.total) * 100) : 0

  return (
    <div className="flex flex-col h-full">
      {/* 탭 네비게이션 */}
      <div className="flex gap-1.5 px-4 pt-4">
        <a href="/admin/workers" className="px-4 py-2 text-gray-600 hover:bg-gray-100 text-sm font-medium rounded-xl transition-colors">👷 직원정보</a>
        <a href="/admin/payroll" className="px-4 py-2 text-gray-600 hover:bg-gray-100 text-sm font-medium rounded-xl transition-colors">💰 급여정산</a>
        <span className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl">📈 매출매입</span>
        <a href="/admin/members" className="px-4 py-2 text-gray-600 hover:bg-gray-100 text-sm font-medium rounded-xl transition-colors">🔑 계정관리</a>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {/* 월 선택기 */}
        <div className="flex items-center justify-between my-4">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">‹</button>
          <div className="text-center">
            <h2 className="text-base font-bold text-gray-900">{displayMonth}</h2>
            <p className="text-xs text-gray-400">매출매입 현황</p>
          </div>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">›</button>
        </div>

        {/* 탭 + 시트 버튼 */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 flex-1">
            <button onClick={() => setTab('dashboard')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === 'dashboard' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
              대시보드
            </button>
            <button onClick={() => setTab('detail')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === 'detail' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
              상세내역
            </button>
          </div>
          <button onClick={downloadSheet} disabled={!data}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors whitespace-nowrap">
            📊 시트 만들기
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12"><p className="text-sm text-gray-400">불러오는 중...</p></div>
        ) : !data ? null : tab === 'dashboard' ? (

          /* ── 대시보드 ── */
          <div className="space-y-4">
            {/* 핵심 지표 카드 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <p className="text-xs text-blue-500 font-medium mb-1">매출</p>
                <p className="text-xl font-bold text-blue-700">{fmt(data.revenue.total)}원</p>
                <p className="text-xs text-blue-400 mt-0.5">{data.revenue.items.length}건</p>
              </div>
              <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                <p className="text-xs text-red-500 font-medium mb-1">총 지출</p>
                <p className="text-xl font-bold text-red-700">{fmt(totalExpense)}원</p>
                <p className="text-xs text-red-400 mt-0.5">인건비+고정비+변동비</p>
              </div>
            </div>

            {/* 순이익 대형 카드 */}
            <div className={`rounded-2xl p-5 border-2 ${data.net_profit >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              <p className={`text-sm font-semibold mb-1 ${data.net_profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {data.net_profit >= 0 ? '순이익' : '순손실'}
              </p>
              <p className={`text-3xl font-bold ${data.net_profit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {data.net_profit >= 0 ? '+' : ''}{fmt(data.net_profit)}원
              </p>
              <p className={`text-sm mt-1 ${data.net_profit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                수익률 {profitRate}%
              </p>
            </div>

            {/* 지출 구성 차트 */}
            <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">지출 구성</p>
              {totalExpense > 0 ? (
                <>
                  <div>
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>인건비</span><span className="font-mono">{fmt(data.labor.total)}원</span>
                    </div>
                    <Bar value={data.labor.total} total={totalExpense} color="bg-orange-400" />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>고정비</span><span className="font-mono">{fmt(data.fixed.total)}원</span>
                    </div>
                    <Bar value={data.fixed.total} total={totalExpense} color="bg-indigo-400" />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>변동비</span><span className="font-mono">{fmt(data.variable.total)}원</span>
                    </div>
                    <Bar value={data.variable.total} total={totalExpense} color="bg-purple-400" />
                  </div>
                </>
              ) : (
                <p className="text-xs text-gray-400 text-center py-2">지출 데이터 없음</p>
              )}
            </div>

            {/* 요약 테이블 */}
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-50">
                  {[
                    { label: '매출', value: data.revenue.total, color: 'text-blue-700', sign: '+' },
                    { label: '인건비', value: data.labor.total, color: 'text-orange-600', sign: '-' },
                    { label: '고정비', value: data.fixed.total, color: 'text-indigo-600', sign: '-' },
                    { label: '변동비', value: data.variable.total, color: 'text-purple-600', sign: '-' },
                  ].map(({ label, value, color, sign }) => (
                    <tr key={label}>
                      <td className="px-4 py-3 text-gray-600 font-medium">{label}</td>
                      <td className={`px-4 py-3 text-right font-mono font-semibold ${color}`}>
                        {sign} {fmt(value)}원
                      </td>
                    </tr>
                  ))}
                  <tr className={`border-t-2 border-gray-200 ${data.net_profit >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                    <td className="px-4 py-3 font-bold text-gray-900">순이익</td>
                    <td className={`px-4 py-3 text-right font-mono font-bold text-lg ${data.net_profit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {data.net_profit >= 0 ? '+ ' : ''}{fmt(data.net_profit)}원
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        ) : (

          /* ── 상세내역 ── */
          <div className="space-y-4">

            {/* 매출 */}
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-blue-800">매출</span>
                  <span className="text-xs text-blue-500 ml-2">서비스통합관리 자동산정</span>
                </div>
                <span className="text-sm font-bold text-blue-700 font-mono">{fmt(data.revenue.total)}원</span>
              </div>
              <div className="divide-y divide-gray-50">
                {data.revenue.items.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">{displayMonth} 매출 없음</p>
                ) : data.revenue.items.map(item => (
                  <div key={item.id} className="px-4 py-2.5 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{item.business_name}</p>
                      <p className="text-xs text-gray-400">{fmtDate(item.construction_date)} · {item.service_type} · {item.payment_method ?? '-'}</p>
                    </div>
                    <span className="text-sm font-semibold text-blue-600 font-mono whitespace-nowrap">{fmt(item.total)}원</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 인건비 */}
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-orange-50 border-b border-orange-100 flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-orange-800">인건비</span>
                  <span className="text-xs text-orange-500 ml-2">급여정산 자동산정</span>
                </div>
                <span className="text-sm font-bold text-orange-700 font-mono">{fmt(data.labor.total)}원</span>
              </div>
              <div className="px-4 py-3">
                {data.labor.records.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-2">{displayMonth} 급여정산 데이터 없음</p>
                ) : (
                  <p className="text-xs text-gray-500">{data.labor.records.length}명 합계 (담당자+작업자 최종지급액 기준)</p>
                )}
              </div>
            </div>

            {/* 고정비 */}
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-indigo-800">고정비</span>
                  <span className="text-xs text-indigo-400 ml-2">임대료, 보험료 등</span>
                </div>
                <span className="text-sm font-bold text-indigo-700 font-mono">{fmt(data.fixed.total)}원</span>
              </div>
              <div className="px-4 py-2">
                {data.fixed.records.map(r => (
                  <RecordRow key={r.id} record={r}
                    onDelete={handleDeleteRecord}
                    onUpdate={handleUpdateRecord} />
                ))}
                {data.fixed.records.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-3">항목 없음</p>
                )}
                <AddItemForm onAdd={(name, amount, note) => handleAddRecord('fixed', name, amount, note)} />
              </div>
            </div>

            {/* 변동비 */}
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-purple-50 border-b border-purple-100 flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-purple-800">변동비</span>
                  <span className="text-xs text-purple-400 ml-2">소모품, 교통비 등</span>
                </div>
                <span className="text-sm font-bold text-purple-700 font-mono">{fmt(data.variable.total)}원</span>
              </div>
              <div className="px-4 py-2">
                {data.variable.records.map(r => (
                  <RecordRow key={r.id} record={r}
                    onDelete={handleDeleteRecord}
                    onUpdate={handleUpdateRecord} />
                ))}
                {data.variable.records.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-3">항목 없음</p>
                )}
                <AddItemForm onAdd={(name, amount, note) => handleAddRecord('variable', name, amount, note)} />
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
