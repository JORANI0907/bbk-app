'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'

interface BillingRecord {
  id: string
  customer_id: string
  billing_type: 'monthly' | 'annual'
  billing_period: string
  amount: number
  due_date: string
  paid_date: string | null
  status: 'pending' | 'paid' | 'overdue'
  notes: string | null
  created_at: string
}

interface Props {
  customerId: string
  customerType: string        // '정기딥케어' | '정기엔드케어'
  billingCycle: string        // '월간' | '연간'
  billingAmount: number | null
  paymentDay: number | null   // 매월 결제일 (정기엔드케어)
  contractEndDate: string | null
}

const STATUS_STYLE: Record<BillingRecord['status'], { badge: string; label: string }> = {
  pending: { badge: 'bg-yellow-100 text-yellow-700', label: '미결제' },
  paid:    { badge: 'bg-emerald-100 text-emerald-700', label: '결제완료' },
  overdue: { badge: 'bg-red-100 text-red-700', label: '연체' },
}

const fmtDate = (d: string | null) => d ? d.slice(0, 10).replace(/-/g, '.') : '-'
const fmt = (n: number) => n.toLocaleString('ko-KR')

function suggestNextPeriod(
  customerType: string,
  billingCycle: string,
  existingPeriods: string[],
  paymentDay: number | null,
  contractEndDate: string | null,
): { billing_type: 'monthly' | 'annual'; billing_period: string; due_date: string } | null {
  const today = new Date()

  if (customerType === '정기딥케어' && billingCycle === '연간') {
    // 연간: 아직 등록되지 않은 연도 제안
    const currentYear = today.getFullYear()
    for (let y = currentYear; y <= currentYear + 1; y++) {
      const period = String(y)
      if (!existingPeriods.includes(period)) {
        const dueDate = contractEndDate
          ? contractEndDate.slice(0, 10)
          : `${y}-12-31`
        return { billing_type: 'annual', billing_period: period, due_date: dueDate }
      }
    }
    return null
  }

  if (customerType === '정기엔드케어') {
    // 월간: 이번 달 또는 다음 달 제안
    const day = paymentDay ?? 25
    const tryMonths = [
      new Date(today.getFullYear(), today.getMonth(), 1),
      new Date(today.getFullYear(), today.getMonth() + 1, 1),
    ]
    for (const base of tryMonths) {
      const period = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`
      if (!existingPeriods.includes(period)) {
        const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
        const dueDay = Math.min(day, lastDay)
        const dueDate = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`
        return { billing_type: 'monthly', billing_period: period, due_date: dueDate }
      }
    }
    return null
  }

  return null
}

export function BillingHistoryPanel({
  customerId, customerType, billingCycle, billingAmount, paymentDay, contractEndDate,
}: Props) {
  const [billings, setBillings] = useState<BillingRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10))

  // 신규 청구 폼
  const [newPeriod, setNewPeriod] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [newType, setNewType] = useState<'monthly' | 'annual'>('monthly')
  const [saving, setSaving] = useState(false)

  const isAnnual = customerType === '정기딥케어' && billingCycle === '연간'
  const isEndCare = customerType === '정기엔드케어'

  const fetchBillings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/billings?customer_id=${customerId}`)
      const data = await res.json()
      setBillings(data.billings ?? [])
    } catch {
      setBillings([])
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => { fetchBillings() }, [fetchBillings])

  const openForm = () => {
    const existingPeriods = billings.map(b => b.billing_period)
    const suggestion = suggestNextPeriod(customerType, billingCycle, existingPeriods, paymentDay, contractEndDate)
    if (suggestion) {
      setNewType(suggestion.billing_type)
      setNewPeriod(suggestion.billing_period)
      setNewDueDate(suggestion.due_date)
    } else {
      setNewType(isAnnual ? 'annual' : 'monthly')
      setNewPeriod('')
      setNewDueDate('')
    }
    setNewAmount(billingAmount ? String(billingAmount) : '')
    setNewNotes('')
    setShowForm(true)
  }

  const handleAdd = async () => {
    if (!newPeriod || !newDueDate || !newAmount) {
      toast.error('청구 기간, 결제 예정일, 금액은 필수입니다.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/billings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerId,
          billing_type: newType,
          billing_period: newPeriod,
          amount: Number(newAmount),
          due_date: newDueDate,
          notes: newNotes || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '등록 실패')
      toast.success('청구가 등록되었습니다.')
      setShowForm(false)
      await fetchBillings()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '등록 실패')
    } finally {
      setSaving(false)
    }
  }

  const handleMarkPaid = async (billing: BillingRecord) => {
    try {
      const res = await fetch('/api/admin/billings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: billing.id, status: 'paid', paid_date: paidDate }),
      })
      if (!res.ok) throw new Error('처리 실패')
      toast.success('결제 완료로 처리되었습니다.')
      setMarkingId(null)
      await fetchBillings()
    } catch {
      toast.error('처리 중 오류가 발생했습니다.')
    }
  }

  const handleMarkOverdue = async (id: string) => {
    try {
      const res = await fetch('/api/admin/billings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'overdue' }),
      })
      if (!res.ok) throw new Error('처리 실패')
      toast.success('연체로 표시되었습니다.')
      await fetchBillings()
    } catch {
      toast.error('처리 중 오류가 발생했습니다.')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('이 청구 내역을 삭제하시겠습니까?')) return
    try {
      const res = await fetch(`/api/admin/billings?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('삭제 실패')
      toast.success('삭제되었습니다.')
      await fetchBillings()
    } catch {
      toast.error('삭제 중 오류가 발생했습니다.')
    }
  }

  if (!isAnnual && !isEndCare) return null

  const typeLabel = isAnnual ? '연간 결제 이력' : '월간 청구 이력'
  const accentColor = isAnnual ? 'blue' : 'purple'
  const headerBg = isAnnual ? 'bg-blue-50 border-blue-100' : 'bg-purple-50 border-purple-100'
  const addBtnColor = isAnnual ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700'
  const periodPlaceholder = isAnnual ? '예: 2026' : '예: 2026-04'
  const periodHint = isAnnual ? '연도 (예: 2026)' : '연-월 (예: 2026-04)'

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <div className={`flex items-center justify-between px-4 py-2.5 border-b ${headerBg}`}>
        <p className="text-xs font-semibold text-gray-600">{typeLabel}</p>
        <button
          onClick={openForm}
          className={`px-2.5 py-1 text-xs text-white font-medium rounded-lg transition-colors ${addBtnColor}`}
        >
          + 청구 추가
        </button>
      </div>

      {/* 신규 청구 폼 */}
      {showForm && (
        <div className="p-3 border-b border-gray-100 bg-gray-50 space-y-2">
          <p className="text-xs font-semibold text-gray-700">새 청구 등록</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-0.5 block">청구 기간 <span className="text-gray-400">({periodHint})</span></label>
              <input
                type="text" value={newPeriod} onChange={e => setNewPeriod(e.target.value)}
                placeholder={periodPlaceholder}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-0.5 block">결제 예정일</label>
              <input
                type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-0.5 block">청구 금액 (원)</label>
            <input
              type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)}
              placeholder="0"
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-0.5 block">메모 (선택)</label>
            <input
              type="text" value={newNotes} onChange={e => setNewNotes(e.target.value)}
              placeholder="특이사항 입력"
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd} disabled={saving}
              className={`flex-1 py-1.5 text-xs text-white font-semibold rounded-lg transition-colors disabled:opacity-60 ${addBtnColor}`}
            >
              {saving ? '등록 중...' : '등록'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 py-1.5 text-xs text-gray-600 font-medium rounded-lg bg-gray-200 hover:bg-gray-300 transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}

      <div className="divide-y divide-gray-50">
        {loading ? (
          <p className="text-xs text-gray-400 p-4 text-center">불러오는 중...</p>
        ) : billings.length === 0 ? (
          <p className="text-xs text-gray-400 p-4 text-center">청구 내역이 없습니다.</p>
        ) : (
          billings.map(b => (
            <div key={b.id} className="p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-800">{b.billing_period}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_STYLE[b.status].badge}`}>
                    {STATUS_STYLE[b.status].label}
                  </span>
                </div>
                <span className="text-xs font-semibold text-gray-700">{fmt(b.amount)}원</span>
              </div>

              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>예정: {fmtDate(b.due_date)}</span>
                {b.paid_date && <span className="text-emerald-600">완료: {fmtDate(b.paid_date)}</span>}
              </div>

              {b.notes && (
                <p className="text-xs text-gray-400 truncate">{b.notes}</p>
              )}

              {/* 결제 완료 처리 영역 */}
              {b.status !== 'paid' && (
                <div className="space-y-1.5 pt-1">
                  {markingId === b.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                      <button
                        onClick={() => handleMarkPaid(b)}
                        className="px-2.5 py-1 text-xs bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap"
                      >
                        확인
                      </button>
                      <button
                        onClick={() => setMarkingId(null)}
                        className="px-2 py-1 text-xs bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300 transition-colors"
                      >
                        취소
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => { setMarkingId(b.id); setPaidDate(new Date().toISOString().slice(0, 10)) }}
                        className="flex-1 py-1 text-xs bg-emerald-50 text-emerald-700 font-medium rounded-lg border border-emerald-200 hover:bg-emerald-100 transition-colors"
                      >
                        결제 완료 처리
                      </button>
                      {b.status !== 'overdue' && (
                        <button
                          onClick={() => handleMarkOverdue(b.id)}
                          className="px-2.5 py-1 text-xs bg-red-50 text-red-600 rounded-lg border border-red-200 hover:bg-red-100 transition-colors"
                        >
                          연체
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(b.id)}
                        className="px-2.5 py-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
                        title="삭제"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 결제 완료된 경우 삭제만 */}
              {b.status === 'paid' && (
                <div className="flex justify-end">
                  <button
                    onClick={() => handleDelete(b.id)}
                    className="text-xs text-gray-300 hover:text-red-400 transition-colors"
                  >
                    삭제
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
