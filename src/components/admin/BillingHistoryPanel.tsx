'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { X, Info, Pencil, Check } from 'lucide-react'

interface BillingRecord {
  id: string
  customer_id: string
  billing_type: 'monthly' | 'annual' | 'onetime'
  billing_period: string
  amount: number
  due_date: string
  paid_date: string | null
  status: 'pending' | 'paid' | 'overdue'
  notes: string | null
  tax_invoice_issued: boolean | null
  tax_invoice_issued_date: string | null
  billing_timing: 'prepaid' | 'postpaid' | null
  created_at: string
}

/** '2026-07' → '7월', '2026' → '2026년' */
function periodToLabel(period: string): string {
  if (/^\d{4}-\d{2}$/.test(period)) {
    return `${parseInt(period.slice(5, 7), 10)}월`
  }
  return `${period}년`
}

interface Props {
  customerId: string
  customerType: string
  billingCycle: string
  billingAmount: number | null
  paymentDay: number | null
  contractStartDate: string | null
  contractEndDate: string | null
  onChange?: () => void
}

const STATUS_STYLE: Record<BillingRecord['status'], { badge: string; label: string }> = {
  pending: { badge: 'bg-yellow-100 text-yellow-700', label: '미결제' },
  paid:    { badge: 'bg-emerald-100 text-emerald-700', label: '결제완료' },
  overdue: { badge: 'bg-red-100 text-red-700', label: '연체' },
}

const fmtDate = (d: string | null) => d ? d.slice(0, 10).replace(/-/g, '.') : '-'
const fmt = (n: number) => n.toLocaleString('ko-KR')

export function BillingHistoryPanel({
  customerId, customerType, billingCycle, billingAmount, contractStartDate, onChange,
}: Props) {
  const [billings, setBillings] = useState<BillingRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10))
  // 결제 완료 처리 시 실제 결제 금액(마스터 총액이 기본값, 필요시 수정)
  const [paidAmount, setPaidAmount] = useState<string>('')
  const [expanded, setExpanded] = useState(false)
  const [showInfo, setShowInfo] = useState(false)

  // 인라인 금액/날짜 수정
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editDueDate, setEditDueDate] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const isAnnual  = billingCycle === '연간'
  const isRegular = customerType === '정기딥케어' || customerType === '정기엔드케어'

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

  const handleMarkPaid = async (billing: BillingRecord) => {
    // 사용자 입력 금액이 있으면 그 값으로, 없으면 기존 amount 유지
    const parsedAmount = paidAmount.trim() === '' ? billing.amount : Number(paidAmount)
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      toast.error('금액을 정확히 입력하세요.')
      return
    }
    try {
      const res = await fetch('/api/admin/billings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: billing.id, status: 'paid', paid_date: paidDate, amount: parsedAmount }),
      })
      if (!res.ok) throw new Error('처리 실패')
      toast.success('결제 완료로 처리되었습니다.')
      setMarkingId(null)
      setPaidAmount('')
      await fetchBillings()
      onChange?.()
    } catch {
      toast.error('처리 중 오류가 발생했습니다.')
    }
  }

  const handleMarkUnpaid = async (id: string) => {
    if (!confirm('결제 완료를 취소하시겠습니까? 재무관리 매출에서도 제외됩니다.')) return
    try {
      const res = await fetch('/api/admin/billings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'pending', paid_date: null }),
      })
      if (!res.ok) throw new Error('처리 실패')
      toast.success('결제 취소 처리되었습니다.')
      await fetchBillings()
      onChange?.()
    } catch {
      toast.error('처리 중 오류가 발생했습니다.')
    }
  }

  const handleToggleTaxInvoice = async (billing: BillingRecord) => {
    const nextIssued = !billing.tax_invoice_issued
    try {
      const res = await fetch('/api/admin/billings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: billing.id,
          tax_invoice_issued: nextIssued,
          tax_invoice_issued_date: nextIssued ? new Date().toISOString().slice(0, 10) : null,
        }),
      })
      if (!res.ok) throw new Error('처리 실패')
      toast.success(nextIssued ? '세금계산서 발행 완료로 표시했습니다.' : '세금계산서 발행 해제했습니다.')
      await fetchBillings()
      onChange?.()
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
      onChange?.()
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
      onChange?.()
    } catch {
      toast.error('삭제 중 오류가 발생했습니다.')
    }
  }

  const openEdit = (b: BillingRecord) => {
    setEditingId(b.id)
    setEditAmount(String(b.amount))
    setEditDueDate(b.due_date)
  }

  const handleSaveEdit = async (id: string) => {
    if (!editAmount || !editDueDate) { toast.error('금액과 결제 예정일을 입력하세요.'); return }
    setEditSaving(true)
    try {
      const res = await fetch('/api/admin/billings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, amount: Number(editAmount), due_date: editDueDate }),
      })
      if (!res.ok) throw new Error('수정 실패')
      toast.success('수정되었습니다.')
      setEditingId(null)
      await fetchBillings()
      onChange?.()
    } catch {
      toast.error('수정 중 오류가 발생했습니다.')
    } finally {
      setEditSaving(false)
    }
  }

  if (!isRegular || !billingCycle) return null

  const typeLabel     = isAnnual ? '연간 결제 이력' : '월간 청구 이력'
  const headerBg      = isAnnual ? 'bg-brand-50 border-brand-100' : 'bg-purple-50 border-purple-100'

  const now          = new Date()
  const currentYear  = String(now.getFullYear())
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const currentKey   = isAnnual ? currentYear : currentMonth
  const currentLabel = isAnnual ? '올해' : '이번달'

  const visibleBillings = expanded ? billings : billings.filter(b => b.billing_period === currentKey)
  const hiddenCount     = billings.length - visibleBillings.length

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      {/* 헤더 */}
      <div className={`flex items-center justify-between px-4 py-2.5 border-b ${headerBg}`}>
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-semibold text-gray-600">{typeLabel}</p>
          <button onClick={() => setShowInfo(v => !v)} className="text-gray-400 hover:text-gray-600" title="이용 안내">
            <Info size={13} />
          </button>
        </div>
        {billings.length > 0 && (hiddenCount > 0 || expanded) && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap"
          >
            {expanded ? '접기 ▲' : `전체 보기 (${billings.length}건) ▼`}
          </button>
        )}
      </div>

      {/* 이용 안내 패널 */}
      {showInfo && (
        <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 space-y-1.5">
          <p className="text-xs font-semibold text-blue-700 mb-1">이력 섹션 이용 안내</p>
          <div className="flex gap-2 text-xs text-blue-600">
            <span className="shrink-0">①</span>
            <span>계약 정보(계약 시작일·계약 금액·결제 주기)를 입력하고 <strong>저장</strong>하면 계약기간 전체 이력이 자동 생성됩니다.</span>
          </div>
          <div className="flex gap-2 text-xs text-blue-600">
            <span className="shrink-0">②</span>
            <span>각 이력에서 <strong>결제 완료 처리</strong> 버튼을 누르면 재무관리 매출에 자동 반영됩니다.</span>
          </div>
          <div className="flex gap-2 text-xs text-blue-600">
            <span className="shrink-0">③</span>
            <span>금액이나 결제 예정일을 수정하려면 각 이력의 <strong>✏️ 수정</strong> 버튼을 사용하세요.</span>
          </div>
        </div>
      )}

      {/* 계약기간 미설정 안내 */}
      {(!contractStartDate || !billingAmount) && billings.length === 0 && (
        <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100">
          <p className="text-xs text-amber-700">
            계약 시작일과 계약 금액을 저장하면 청구 이력이 자동으로 생성됩니다.
          </p>
        </div>
      )}

      <div className="divide-y divide-gray-50">
        {loading ? (
          <p className="text-xs text-gray-400 p-4 text-center">불러오는 중...</p>
        ) : billings.length === 0 ? (
          <p className="text-xs text-gray-400 p-4 text-center">청구 내역이 없습니다.</p>
        ) : visibleBillings.length === 0 ? (
          <p className="text-xs text-gray-400 p-4 text-center">
            {currentLabel} 내역이 없습니다. 상단 &quot;전체 보기&quot;로 이전 내역을 확인하세요.
          </p>
        ) : (
          visibleBillings.map(b => (
            <div key={b.id} className="p-3 space-y-1.5">
              {/* 기간 + 상태 + 금액 행 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-gray-800">{b.billing_period}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_STYLE[b.status].badge}`}>
                    {STATUS_STYLE[b.status].label}
                  </span>
                  {b.billing_timing === 'postpaid' && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-700">
                      후납
                    </span>
                  )}
                  {b.tax_invoice_issued && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-brand-100 text-brand-700">
                      계산서완료
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-gray-700">{fmt(b.amount)}원</span>
                  {editingId !== b.id && (
                    <button onClick={() => openEdit(b)} className="text-gray-300 hover:text-brand-500 transition-colors" title="수정">
                      <Pencil size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* 인라인 수정 폼 */}
              {editingId === b.id && (
                <div className="flex items-center gap-1.5 pt-1">
                  <input
                    type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)}
                    placeholder="금액"
                    className="w-24 border border-border rounded-md px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"
                  />
                  <span className="text-xs text-text-secondary">원</span>
                  <input
                    type="date" value={editDueDate} onChange={e => setEditDueDate(e.target.value)}
                    className="flex-1 border border-border rounded-md px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"
                  />
                  <button onClick={() => handleSaveEdit(b.id)} disabled={editSaving}
                    className="p-1 text-emerald-600 hover:text-emerald-800 disabled:opacity-50">
                    <Check size={14} />
                  </button>
                  <button onClick={() => setEditingId(null)} className="p-1 text-gray-400 hover:text-gray-600">
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* 날짜 정보 행 */}
              <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                <span>예정: {fmtDate(b.due_date)}</span>
                {b.billing_timing === 'postpaid' && (
                  <span className="text-indigo-600">{periodToLabel(b.billing_period)} 서비스분</span>
                )}
                {b.paid_date && <span className="text-emerald-600">완료: {fmtDate(b.paid_date)}</span>}
                {b.tax_invoice_issued_date && (
                  <span className="text-brand-600">계산서: {fmtDate(b.tax_invoice_issued_date)}</span>
                )}
              </div>

              {b.notes && <p className="text-xs text-gray-400 truncate">{b.notes}</p>}

              {/* 미결제 액션 */}
              {b.status !== 'paid' && (
                <div className="space-y-1.5 pt-1">
                  {markingId === b.id ? (
                    <div className="space-y-1.5 border border-emerald-200 bg-emerald-50/60 rounded-lg p-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex flex-col gap-0.5">
                          <label className="text-[10px] font-semibold text-emerald-800">결제일</label>
                          <input
                            type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)}
                            className="border border-emerald-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400"
                          />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <label className="text-[10px] font-semibold text-emerald-800">금액 (기본: 마스터 총액)</label>
                          <input
                            type="number" value={paidAmount} onChange={e => setPaidAmount(e.target.value)}
                            placeholder={fmt(b.amount)}
                            className="border border-emerald-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-emerald-700 leading-tight">
                        이 결제일·금액이 매출 페이지에 반영됩니다. 금액 미입력 시 기본값({fmt(b.amount)}원) 사용.
                      </p>
                      <div className="flex gap-1.5">
                        <button onClick={() => handleMarkPaid(b)}
                          className="flex-1 px-2.5 py-1 text-xs bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors">
                          결제 완료 처리
                        </button>
                        <button onClick={() => { setMarkingId(null); setPaidAmount('') }}
                          className="px-3 py-1 text-xs bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300 transition-colors">
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-1.5 flex-wrap">
                      <button
                        onClick={() => {
                          setMarkingId(b.id)
                          setPaidDate(new Date().toISOString().slice(0, 10))
                          setPaidAmount('')  // 빈값이면 기본값(b.amount) 사용
                        }}
                        className="flex-1 py-1 text-xs bg-emerald-50 text-emerald-700 font-medium rounded-lg border border-emerald-200 hover:bg-emerald-100 transition-colors"
                      >
                        결제 완료 처리
                      </button>
                      <button
                        onClick={() => handleToggleTaxInvoice(b)}
                        className={`flex-1 py-1 text-xs font-medium rounded-lg border transition-colors ${
                          b.tax_invoice_issued
                            ? 'bg-brand-100 text-brand-700 border-brand-300 hover:bg-brand-200'
                            : 'bg-brand-50 text-brand-700 border-brand-200 hover:bg-brand-100'
                        }`}
                      >
                        {b.tax_invoice_issued ? '계산서 발행 취소' : '세금계산서 발행 처리'}
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
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 결제완료 액션 */}
              {b.status === 'paid' && (
                <div className="flex items-center gap-1.5 justify-between flex-wrap">
                  <button
                    onClick={() => handleMarkUnpaid(b.id)}
                    className="py-1 px-2.5 text-xs font-medium rounded-lg border transition-colors bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100"
                  >
                    결제 취소
                  </button>
                  <button
                    onClick={() => handleToggleTaxInvoice(b)}
                    className={`flex-1 py-1 text-xs font-medium rounded-lg border transition-colors ${
                      b.tax_invoice_issued
                        ? 'bg-brand-100 text-brand-700 border-brand-300 hover:bg-brand-200'
                        : 'bg-brand-50 text-brand-700 border-brand-200 hover:bg-brand-100'
                    }`}
                  >
                    {b.tax_invoice_issued ? '계산서 발행 취소' : '세금계산서 발행 처리'}
                  </button>
                  <button
                    onClick={() => handleDelete(b.id)}
                    className="text-xs text-gray-300 hover:text-red-400 transition-colors px-2 py-1"
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
