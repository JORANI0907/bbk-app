'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import toast from 'react-hot-toast'

// ─── 타입 ─────────────────────────────────────────────────────
type CustomerType = '1회성케어' | '정기딥케어' | '정기엔드케어'
type CustomerStatus = 'active' | 'paused' | 'terminated'
type BillingCycle = '월간' | '분기' | '반기' | '연간'

interface Customer {
  id: string
  business_name: string
  contact_name: string
  contact_phone: string
  email: string | null
  address: string
  address_detail: string | null
  business_number: string | null
  account_number: string | null
  door_password: string | null
  parking_info: string | null
  special_notes: string | null
  pipeline_status: string
  customer_type: CustomerType | null
  status: CustomerStatus | null
  billing_cycle: BillingCycle | null
  billing_amount: number | null
  billing_start_date: string | null
  billing_next_date: string | null
  contract_start_date: string | null
  contract_end_date: string | null
  unit_price: number | null
  visit_interval_days: number | null
  next_visit_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// ─── 상수 ─────────────────────────────────────────────────────
const CUSTOMER_TYPES: CustomerType[] = ['1회성케어', '정기딥케어', '정기엔드케어']
const BILLING_CYCLES: BillingCycle[] = ['월간', '분기', '반기', '연간']
const BILLING_CYCLE_MONTHS: Record<BillingCycle, number> = { '월간': 1, '분기': 3, '반기': 6, '연간': 12 }
const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = { '월간': '매달', '분기': '3개월마다', '반기': '6개월마다', '연간': '매년' }

const NOTIFY_TYPES_BY_CUSTOMER_TYPE: Record<CustomerType, string[]> = {
  '1회성케어':    ['방문견적알림', '작업완료알림'],
  '정기딥케어':   ['정기결제알림', '정기방문알림', '계약갱신알림', '작업완료알림'],
  '정기엔드케어': ['건당결제알림', '정기방문알림', '계약갱신알림', '작업완료알림'],
}

const TYPE_STYLE: Record<CustomerType, { badge: string; dot: string; tab: string }> = {
  '1회성케어':    { badge: 'bg-gray-100 text-gray-700',     dot: 'bg-gray-400',    tab: 'border-gray-400 text-gray-600' },
  '정기딥케어':   { badge: 'bg-blue-100 text-blue-700',     dot: 'bg-blue-500',    tab: 'border-blue-500 text-blue-600' },
  '정기엔드케어': { badge: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500',  tab: 'border-purple-500 text-purple-600' },
}

const STATUS_STYLE: Record<CustomerStatus, { badge: string; label: string }> = {
  active:     { badge: 'bg-emerald-100 text-emerald-700', label: '활성' },
  paused:     { badge: 'bg-amber-100 text-amber-700',     label: '일시중지' },
  terminated: { badge: 'bg-red-100 text-red-700',         label: '해지' },
}

const EMPTY_FORM = {
  business_name: '', contact_name: '', contact_phone: '', email: '',
  address: '', address_detail: '', business_number: '', account_number: '',
  door_password: '', parking_info: '', special_notes: '',
  customer_type: '1회성케어' as CustomerType,
  status: 'active' as CustomerStatus,
  pipeline_status: 'inquiry',
  billing_cycle: '' as BillingCycle | '',
  billing_amount: '', billing_start_date: '', billing_next_date: '',
  contract_start_date: '', contract_end_date: '',
  unit_price: '', visit_interval_days: '', next_visit_date: '', notes: '',
}

// ─── 헬퍼 ─────────────────────────────────────────────────────
const fmt = (n: number | null | undefined) => n == null ? '-' : n.toLocaleString('ko-KR')
const fmtDate = (d: string | null) => d ? d.slice(0, 10).replace(/-/g, '.') : '-'

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}

function calcNextBillingDate(startDate: string, cycle: BillingCycle): string {
  const months = BILLING_CYCLE_MONTHS[cycle]
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const next = new Date(startDate)
  while (next <= today) next.setMonth(next.getMonth() + months)
  return next.toISOString().slice(0, 10)
}

// ─── 배지 컴포넌트 ────────────────────────────────────────────
function StatusBadges({ customer }: { customer: Customer }) {
  const billingDays = daysUntil(customer.billing_next_date)
  const visitDays = daysUntil(customer.next_visit_date)
  const contractDays = daysUntil(customer.contract_end_date)
  const badges: React.ReactNode[] = []

  if (billingDays != null) {
    if (billingDays < 0)
      badges.push(<span key="b" className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full font-medium whitespace-nowrap">결제지연</span>)
    else if (billingDays <= 7)
      badges.push(<span key="b" className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-full font-medium whitespace-nowrap">결제 {billingDays}일 후</span>)
  }
  if (visitDays != null && visitDays >= 0 && visitDays <= 5)
    badges.push(<span key="v" className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium whitespace-nowrap">방문 {visitDays}일 후</span>)
  if (contractDays != null) {
    if (contractDays < 0)
      badges.push(<span key="c" className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full font-medium whitespace-nowrap">계약만료</span>)
    else if (contractDays <= 30)
      badges.push(<span key="c" className="text-xs px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded-full font-medium whitespace-nowrap">갱신 {contractDays}일 후</span>)
  }
  return badges.length > 0 ? <div className="flex gap-1 flex-wrap mt-1">{badges}</div> : null
}

// ─── 입력 컴포넌트 ────────────────────────────────────────────
function Field({ label, value, onChange, type = 'text', mono, placeholder }: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; mono?: boolean; placeholder?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-24 shrink-0">{label}</span>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className={`flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 ${mono ? 'font-mono' : ''}`} />
    </div>
  )
}

function SelectField({ label, value, options, onChange }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-24 shrink-0">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
        <option value="">선택</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

// ─── 메인 페이지 ──────────────────────────────────────────────
export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [typeTab, setTypeTab] = useState<CustomerType | '전체'>('전체')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Customer | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [form, setForm] = useState<typeof EMPTY_FORM>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [notifyType, setNotifyType] = useState('')
  const [sending, setSending] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/customers')
    const data = await res.json()
    setCustomers(data.customers ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // 고객 선택 시 폼 초기화
  const handleSelect = (c: Customer) => {
    setSelected(c)
    setIsNew(false)
    setNotifyType('')
    setForm({
      business_name: c.business_name ?? '',
      contact_name: c.contact_name ?? '',
      contact_phone: c.contact_phone ?? '',
      email: c.email ?? '',
      address: c.address ?? '',
      address_detail: c.address_detail ?? '',
      business_number: c.business_number ?? '',
      account_number: c.account_number ?? '',
      door_password: c.door_password ?? '',
      parking_info: c.parking_info ?? '',
      special_notes: c.special_notes ?? '',
      customer_type: c.customer_type ?? '1회성케어',
      status: c.status ?? 'active',
      pipeline_status: c.pipeline_status ?? 'inquiry',
      billing_cycle: c.billing_cycle ?? '',
      billing_amount: c.billing_amount?.toString() ?? '',
      billing_start_date: c.billing_start_date ?? '',
      billing_next_date: c.billing_next_date ?? '',
      contract_start_date: c.contract_start_date ?? '',
      contract_end_date: c.contract_end_date ?? '',
      unit_price: c.unit_price?.toString() ?? '',
      visit_interval_days: c.visit_interval_days?.toString() ?? '',
      next_visit_date: c.next_visit_date ?? '',
      notes: c.notes ?? '',
    })
  }

  const handleNew = () => {
    setSelected(null)
    setIsNew(true)
    setNotifyType('')
    setForm(EMPTY_FORM)
  }

  const set = (key: keyof typeof EMPTY_FORM) => (v: string) =>
    setForm(prev => {
      const next = { ...prev, [key]: v }
      // billing_start_date나 billing_cycle 변경 시 next_billing_date 자동계산
      if ((key === 'billing_start_date' || key === 'billing_cycle') && next.billing_start_date && next.billing_cycle) {
        try {
          next.billing_next_date = calcNextBillingDate(next.billing_start_date, next.billing_cycle as BillingCycle)
        } catch { /* ignore */ }
      }
      return next
    })

  const handleSave = async () => {
    if (!form.business_name.trim()) { toast.error('업체명을 입력하세요.'); return }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        business_name: form.business_name.trim(),
        contact_name: form.contact_name || null,
        contact_phone: form.contact_phone || null,
        email: form.email || null,
        address: form.address || null,
        address_detail: form.address_detail || null,
        business_number: form.business_number || null,
        account_number: form.account_number || null,
        door_password: form.door_password || null,
        parking_info: form.parking_info || null,
        special_notes: form.special_notes || null,
        customer_type: form.customer_type,
        status: form.status,
        pipeline_status: form.pipeline_status || 'inquiry',
        notes: form.notes || null,
        billing_cycle: form.billing_cycle || null,
        billing_amount: form.billing_amount ? Number(form.billing_amount) : null,
        billing_start_date: form.billing_start_date || null,
        billing_next_date: form.billing_next_date || null,
        contract_start_date: form.contract_start_date || null,
        contract_end_date: form.contract_end_date || null,
        unit_price: form.unit_price ? Number(form.unit_price) : null,
        visit_interval_days: form.visit_interval_days ? Number(form.visit_interval_days) : null,
        next_visit_date: form.next_visit_date || null,
      }

      if (isNew) {
        const res = await fetch('/api/admin/customers', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || '추가 실패')
        toast.success('고객이 추가되었습니다.')
        setCustomers(prev => [data.customer, ...prev])
        handleSelect(data.customer)
        setIsNew(false)
      } else if (selected) {
        const res = await fetch('/api/admin/customers', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: selected.id, ...body }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || '저장 실패')
        toast.success('저장되었습니다.')
        const updated = { ...selected, ...body } as Customer
        setCustomers(prev => prev.map(c => c.id === selected.id ? updated : c))
        setSelected(updated)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패')
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!selected) return
    if (!confirm(`"${selected.business_name}" 고객을 삭제하시겠습니까?`)) return
    try {
      const res = await fetch(`/api/admin/customers?id=${selected.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '삭제 실패')
      toast.success('삭제되었습니다.')
      setCustomers(prev => prev.filter(c => c.id !== selected.id))
      setSelected(null)
      setIsNew(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '삭제 실패')
    }
  }

  const handleNotify = async () => {
    if (!selected || !notifyType) { toast.error('알림 유형을 선택하세요.'); return }
    setSending(true)
    try {
      const res = await fetch('/api/admin/customers/notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: selected.id, type: notifyType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '발송 실패')
      toast.success(`${notifyType} 발송 완료`)
      setNotifyType('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '발송 실패')
    } finally { setSending(false) }
  }

  // 필터링
  const filtered = useMemo(() => {
    let list = customers
    if (typeTab !== '전체') list = list.filter(c => (c.customer_type ?? '1회성케어') === typeTab)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(c =>
        c.business_name.toLowerCase().includes(q) ||
        (c.contact_name ?? '').toLowerCase().includes(q) ||
        (c.contact_phone ?? '').toLowerCase().includes(q) ||
        (c.address ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [customers, typeTab, search])

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { '전체': customers.length }
    for (const t of CUSTOMER_TYPES) counts[t] = customers.filter(c => (c.customer_type ?? '1회성케어') === t).length
    return counts
  }, [customers])

  const isRegular = form.customer_type === '정기딥케어' || form.customer_type === '정기엔드케어'
  const isEndCare = form.customer_type === '정기엔드케어'
  const notifyOptions = form.customer_type ? NOTIFY_TYPES_BY_CUSTOMER_TYPE[form.customer_type] : []

  return (
    <div className="flex h-full gap-0 min-h-0">
      {/* ── 좌측: 목록 ── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">고객 관리</h1>
          <div className="flex gap-2">
            <button onClick={fetchAll} className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50">새로고침</button>
            <button onClick={handleNew}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
              + 고객 추가
            </button>
          </div>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-gray-200 mb-3">
          {(['전체', ...CUSTOMER_TYPES] as const).map(t => (
            <button key={t} onClick={() => setTypeTab(t)}
              className={`px-3 py-2.5 text-sm font-semibold transition-colors relative whitespace-nowrap ${
                typeTab === t ? 'text-blue-600 border-b-2 border-blue-600 -mb-px' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {t}
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${typeTab === t ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                {typeCounts[t] ?? 0}
              </span>
            </button>
          ))}
        </div>

        {/* 검색 */}
        <div className="relative mb-3">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="업체명, 담당자, 연락처, 주소 검색..."
            className="w-full pl-8 pr-8 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">✕</button>
          )}
        </div>

        {/* 목록 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-auto flex-1">
          {loading ? (
            <div className="py-20 text-center text-gray-400 text-sm">불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center text-gray-400 text-sm">
              {search ? `"${search}" 검색 결과 없음` : '고객이 없습니다.'}
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filtered.map(c => {
                const type = (c.customer_type ?? '1회성케어') as CustomerType
                const typeStyle = TYPE_STYLE[type]
                const statusStyle = STATUS_STYLE[c.status ?? 'active']
                const isSelected = selected?.id === c.id
                return (
                  <div key={c.id} onClick={() => handleSelect(c)}
                    className={`px-4 py-3 cursor-pointer hover:bg-blue-50 transition-colors ${isSelected ? 'bg-blue-50 border-l-2 border-blue-500' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-gray-900 truncate">{c.business_name}</p>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${typeStyle.badge}`}>{type}</span>
                          {c.status !== 'active' && (
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${statusStyle.badge}`}>{statusStyle.label}</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{c.contact_name} · {c.contact_phone}</p>
                        {isRegular && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {c.billing_next_date ? `다음 결제: ${fmtDate(c.billing_next_date)}` : ''}
                            {c.next_visit_date ? `  방문: ${fmtDate(c.next_visit_date)}` : ''}
                          </p>
                        )}
                        <StatusBadges customer={c} />
                      </div>
                      {isEndCare && c.unit_price != null && (
                        <div className="text-right shrink-0">
                          <p className="text-xs text-gray-400">건당</p>
                          <p className="text-sm font-bold text-purple-700">{fmt(c.unit_price)}원</p>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── 우측: 상세 패널 ── */}
      {(selected || isNew) && (
        <div className="w-[460px] ml-5 flex-shrink-0 bg-white rounded-xl border border-gray-200 overflow-y-auto"
          style={{ maxHeight: 'calc(100vh - 6rem)' }}>

          {/* 헤더 */}
          <div className="p-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
            <h2 className="font-bold text-gray-900">{isNew ? '새 고객 추가' : selected?.business_name}</h2>
            <div className="flex items-center gap-1.5">
              {!isNew && (
                <button onClick={handleDelete}
                  className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-2 py-1 rounded-lg transition-colors">
                  삭제
                </button>
              )}
              <button onClick={() => { setSelected(null); setIsNew(false) }}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>
          </div>

          <div className="p-4 space-y-5">
            {/* 고객 유형 + 상태 */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">고객 유형</p>
              <div className="flex gap-1.5 flex-wrap mb-2">
                {CUSTOMER_TYPES.map(t => (
                  <button key={t} onClick={() => set('customer_type')(t)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      form.customer_type === t ? `${TYPE_STYLE[t].badge} ring-2 ring-offset-1 ring-current` : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5">
                {(['active', 'paused', 'terminated'] as CustomerStatus[]).map(s => (
                  <button key={s} onClick={() => set('status')(s)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      form.status === s ? `${STATUS_STYLE[s].badge} ring-2 ring-offset-1 ring-current` : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                    {STATUS_STYLE[s].label}
                  </button>
                ))}
              </div>
            </div>

            {/* 기본 정보 */}
            <div className="bg-gray-50 rounded-xl p-4 flex flex-col gap-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">기본 정보</p>
              <Field label="업체명 *" value={form.business_name} onChange={set('business_name')} />
              <Field label="담당자명" value={form.contact_name} onChange={set('contact_name')} />
              <Field label="연락처" value={form.contact_phone} onChange={set('contact_phone')} />
              <Field label="이메일" value={form.email} onChange={set('email')} />
              <Field label="주소" value={form.address} onChange={set('address')} />
              <Field label="상세주소" value={form.address_detail} onChange={set('address_detail')} />
              <Field label="사업자번호" value={form.business_number} onChange={set('business_number')} mono />
              <Field label="계좌번호" value={form.account_number} onChange={set('account_number')} mono />
              <Field label="출입번호" value={form.door_password} onChange={set('door_password')} placeholder="도어락 비밀번호" />
              <Field label="주차정보" value={form.parking_info} onChange={set('parking_info')} />
            </div>

            {/* 계약 정보 (정기케어만) */}
            {isRegular && (
              <div className="bg-blue-50 rounded-xl p-4 flex flex-col gap-3 border border-blue-100">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">계약 정보</p>

                {/* 정기엔드케어: 건당 단가 */}
                {isEndCare && (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 flex flex-col gap-2">
                    <p className="text-xs font-semibold text-purple-700">건당 단가 (정기엔드케어)</p>
                    <div className="flex items-center gap-2">
                      <input type="number" value={form.unit_price} onChange={e => set('unit_price')(e.target.value)}
                        placeholder="0" className="flex-1 border border-purple-200 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white" />
                      <span className="text-sm text-gray-500">원 / 건</span>
                    </div>
                    {form.unit_price && (
                      <p className="text-xs text-purple-600">건당 {Number(form.unit_price).toLocaleString('ko-KR')}원 청구</p>
                    )}
                  </div>
                )}

                {/* 결제 주기 */}
                <SelectField label="결제 주기" value={form.billing_cycle}
                  options={BILLING_CYCLES.map(c => ({ value: c, label: `${c} (${BILLING_CYCLE_LABELS[c]})` }))}
                  onChange={set('billing_cycle')} />

                {/* 정기딥케어: 금액 */}
                {!isEndCare && (
                  <Field label="결제 금액" value={form.billing_amount} onChange={set('billing_amount')} type="number" placeholder="0" />
                )}

                {/* 결제 시작일 → 자동 계산 */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-24 shrink-0">결제 시작일</span>
                  <input type="date" value={form.billing_start_date} onChange={e => set('billing_start_date')(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-24 shrink-0">다음 결제일</span>
                  <input type="date" value={form.billing_next_date} onChange={e => set('billing_next_date')(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                  {form.billing_start_date && form.billing_cycle && (
                    <button onClick={() => {
                      try {
                        const next = calcNextBillingDate(form.billing_start_date, form.billing_cycle as BillingCycle)
                        set('billing_next_date')(next)
                      } catch { /* ignore */ }
                    }} className="text-xs text-blue-500 hover:text-blue-700 whitespace-nowrap border border-blue-200 rounded px-1.5 py-1">
                      자동
                    </button>
                  )}
                </div>

                {/* 계약 기간 */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-24 shrink-0">계약 시작일</span>
                  <input type="date" value={form.contract_start_date} onChange={e => set('contract_start_date')(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-24 shrink-0">계약 만료일</span>
                  <input type="date" value={form.contract_end_date} onChange={e => set('contract_end_date')(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                </div>

                {/* 방문 주기 */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-24 shrink-0">방문 주기</span>
                  <input type="number" value={form.visit_interval_days} onChange={e => set('visit_interval_days')(e.target.value)}
                    placeholder="30"
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                  <span className="text-xs text-gray-500 shrink-0">일마다</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-24 shrink-0">다음 방문일</span>
                  <input type="date" value={form.next_visit_date} onChange={e => set('next_visit_date')(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                </div>

                {/* 요약 박스 */}
                {(form.billing_next_date || form.contract_end_date) && (
                  <div className="bg-white rounded-lg p-3 border border-blue-200 space-y-1.5 text-xs">
                    {form.billing_next_date && (() => {
                      const days = daysUntil(form.billing_next_date)
                      return (
                        <div className="flex justify-between">
                          <span className="text-gray-500">다음 결제까지</span>
                          <span className={`font-semibold ${days != null && days < 0 ? 'text-red-600' : days != null && days <= 7 ? 'text-orange-600' : 'text-gray-700'}`}>
                            {days == null ? '-' : days < 0 ? `${Math.abs(days)}일 지남` : `${days}일 후`}
                          </span>
                        </div>
                      )
                    })()}
                    {form.contract_end_date && (() => {
                      const days = daysUntil(form.contract_end_date)
                      return (
                        <div className="flex justify-between">
                          <span className="text-gray-500">계약 만료까지</span>
                          <span className={`font-semibold ${days != null && days < 0 ? 'text-red-600' : days != null && days <= 30 ? 'text-yellow-600' : 'text-gray-700'}`}>
                            {days == null ? '-' : days < 0 ? '계약 만료' : `${days}일 후`}
                          </span>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* 특이사항 */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">특이사항 / 메모</p>
              <textarea value={form.notes} onChange={e => set('notes')(e.target.value)}
                rows={2} placeholder="내부 메모를 입력하세요..."
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>

            {/* 저장 */}
            <button onClick={handleSave} disabled={saving}
              className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors">
              {saving ? '저장 중...' : isNew ? '✚ 고객 추가' : '💾 저장'}
            </button>

            {/* 알림 발송 (기존 고객 + 정기케어만) */}
            {!isNew && selected && isRegular && (
              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <p className="text-xs font-semibold text-gray-500 px-4 py-2.5 bg-gray-50 border-b border-gray-100 uppercase tracking-wide">알림 발송</p>
                <div className="p-4 space-y-3">
                  <div className="flex gap-2">
                    <select value={notifyType} onChange={e => setNotifyType(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                      <option value="">알림 유형 선택...</option>
                      {notifyOptions.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button onClick={handleNotify} disabled={sending || !notifyType}
                      className="px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors whitespace-nowrap">
                      {sending ? '발송 중...' : '📣 발송'}
                    </button>
                  </div>
                  {notifyType && (
                    <div className="px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-700">
                      <span className="font-semibold">{notifyType}</span> → {selected.contact_phone}
                      {notifyType === '정기결제알림' && form.billing_next_date && (
                        <span className="ml-2 text-orange-500">({fmtDate(form.billing_next_date)})</span>
                      )}
                      {notifyType === '건당결제알림' && form.unit_price && (
                        <span className="ml-2 text-orange-500">(건당 {Number(form.unit_price).toLocaleString('ko-KR')}원)</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
