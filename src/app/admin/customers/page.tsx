'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import toast from 'react-hot-toast'
import { CustomerRequestsPanel } from '@/components/admin/CustomerRequestsPanel'

// ─── 타입 ─────────────────────────────────────────────────────
type CustomerType = '1회성케어' | '정기딥케어' | '정기엔드케어'
type CustomerStatus = 'active' | 'paused' | 'terminated'
type BillingCycle = '월간' | '연간'

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
  platform_nickname: string | null
  payment_method: string | null
  elevator: string | null
  building_access: string | null
  access_method: string | null
  business_hours_start: string | null
  business_hours_end: string | null
  door_password: string | null
  parking_info: string | null
  special_notes: string | null
  care_scope: string | null
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
  visit_schedule_type: 'weekday' | 'monthly_date' | null
  visit_weekdays: number[] | null
  visit_monthly_dates: number[] | null
  notes: string | null
  created_at: string
  updated_at: string
}

// ─── 상수 ─────────────────────────────────────────────────────
const CUSTOMER_TYPES: CustomerType[] = ['1회성케어', '정기딥케어', '정기엔드케어']
const PAYMENT_METHODS = ['현금', '카드', '계좌이체', '현금(부가세 X)']
const ELEVATOR_OPTIONS = ['있음', '없음', '해당없음']
const BUILDING_ACCESS_OPTIONS = ['신청필요', '신청불필요', '해당없음']
const PARKING_OPTIONS = ['가능', '불가능', '주차없음']

const NOTIFY_TYPES: Record<CustomerType, string[]> = {
  '1회성케어':    ['방문견적알림', '작업완료알림'],
  '정기딥케어':   ['정기결제알림', '정기방문알림', '계약갱신알림', '작업완료알림'],
  '정기엔드케어': ['정기결제알림', '정기방문알림', '계약갱신알림', '작업완료알림'],
}

const TYPE_STYLE: Record<CustomerType, { badge: string; accent: string }> = {
  '1회성케어':    { badge: 'bg-gray-100 text-gray-700',     accent: 'border-gray-300 bg-gray-50' },
  '정기딥케어':   { badge: 'bg-blue-100 text-blue-700',     accent: 'border-blue-200 bg-blue-50' },
  '정기엔드케어': { badge: 'bg-purple-100 text-purple-700', accent: 'border-purple-200 bg-purple-50' },
}

const STATUS_STYLE: Record<CustomerStatus, { badge: string; label: string }> = {
  active:     { badge: 'bg-emerald-100 text-emerald-700', label: '활성' },
  paused:     { badge: 'bg-amber-100 text-amber-700',     label: '일시중지' },
  terminated: { badge: 'bg-red-100 text-red-700',         label: '해지' },
}

const EMPTY_FORM = {
  business_name: '', contact_name: '', contact_phone: '', email: '',
  address: '', address_detail: '', business_number: '', account_number: '',
  platform_nickname: '', payment_method: '',
  elevator: '', building_access: '', access_method: '',
  business_hours_start: '', business_hours_end: '',
  door_password: '', parking_info: '', special_notes: '', care_scope: '',
  customer_type: '1회성케어' as CustomerType,
  status: 'active' as CustomerStatus,
  pipeline_status: 'inquiry',
  billing_cycle: '월간' as BillingCycle,
  billing_amount: '',
  billing_start_date: '', billing_next_date: '',
  contract_start_date: '', contract_end_date: '',
  unit_price: '',
  visit_interval_days: '', next_visit_date: '',
  visit_schedule_type: '', notes: '',
}

// ─── 방문 주기 ────────────────────────────────────────────────
const WEEKDAYS = [
  { label: '월', value: 1 }, { label: '화', value: 2 }, { label: '수', value: 3 },
  { label: '목', value: 4 }, { label: '금', value: 5 }, { label: '토', value: 6 },
  { label: '일', value: 0 },
]

function VisitScheduleEditor({ scheduleType, weekdays, monthlyDates, onScheduleTypeChange, onWeekdaysChange, onMonthlyDatesChange, color = 'blue' }: {
  scheduleType: string; weekdays: number[]; monthlyDates: number[]
  onScheduleTypeChange: (v: string) => void
  onWeekdaysChange: (v: number[]) => void
  onMonthlyDatesChange: (v: number[]) => void
  color?: 'blue' | 'purple'
}) {
  const active = color === 'purple' ? 'bg-purple-600 text-white' : 'bg-blue-600 text-white'
  const ring = color === 'purple' ? 'ring-purple-400' : 'ring-blue-400'

  const toggleWeekday = (day: number) =>
    onWeekdaysChange(weekdays.includes(day) ? weekdays.filter(d => d !== day) : [...weekdays, day])
  const toggleDate = (date: number) =>
    onMonthlyDatesChange(monthlyDates.includes(date) ? monthlyDates.filter(d => d !== date) : [...monthlyDates, date])

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-gray-700">방문 주기 설정</p>
      <div className="flex gap-1.5">
        {[{ key: 'weekday', label: '요일별' }, { key: 'monthly_date', label: '날짜별' }].map(({ key, label }) => (
          <button key={key} onClick={() => onScheduleTypeChange(key)}
            className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition-colors ${scheduleType === key ? active : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {label}
          </button>
        ))}
      </div>

      {scheduleType === 'weekday' && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-gray-500">매월 방문할 요일을 선택하세요</p>
          <div className="flex gap-1">
            {WEEKDAYS.map(({ label, value }) => (
              <button key={value} onClick={() => toggleWeekday(value)}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${weekdays.includes(value) ? active : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {label}
              </button>
            ))}
          </div>
          {weekdays.length > 0 && (
            <p className={`text-xs ${color === 'purple' ? 'text-purple-600' : 'text-blue-600'}`}>
              선택: {WEEKDAYS.filter(w => weekdays.includes(w.value)).map(w => w.label).join(', ')}요일
            </p>
          )}
        </div>
      )}

      {scheduleType === 'monthly_date' && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-gray-500">매월 방문할 날짜를 선택하세요</p>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
              <button key={d} onClick={() => toggleDate(d)}
                className={`py-1.5 text-xs font-medium rounded-lg transition-colors ${monthlyDates.includes(d) ? active : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {d}
              </button>
            ))}
          </div>
          {monthlyDates.length > 0 && (
            <p className={`text-xs ${color === 'purple' ? 'text-purple-600' : 'text-blue-600'}`}>
              선택: 매월 {[...monthlyDates].sort((a, b) => a - b).join('일, ')}일
            </p>
          )}
        </div>
      )}
    </div>
  )
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
  const months = cycle === '월간' ? 1 : 12
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const next = new Date(startDate)
  while (next <= today) next.setMonth(next.getMonth() + months)
  return next.toISOString().slice(0, 10)
}

// ─── 상태 배지 ────────────────────────────────────────────────
function StatusBadges({ customer }: { customer: Customer }) {
  const billingDays = daysUntil(customer.billing_next_date)
  const visitDays   = daysUntil(customer.next_visit_date)
  const contractDays = daysUntil(customer.contract_end_date)
  const badges: React.ReactNode[] = []

  if (billingDays != null) {
    if (billingDays < 0)
      badges.push(<span key="b0" className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">결제지연 {Math.abs(billingDays)}일</span>)
    else if (billingDays <= 7)
      badges.push(<span key="b1" className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-full font-medium">결제 {billingDays}일 후</span>)
  }
  if (visitDays != null && visitDays >= 0 && visitDays <= 5)
    badges.push(<span key="v" className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">방문 {visitDays}일 후</span>)
  if (contractDays != null) {
    if (contractDays < 0)
      badges.push(<span key="c0" className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">계약만료</span>)
    else if (contractDays <= 30)
      badges.push(<span key="c1" className="text-xs px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded-full font-medium">갱신 {contractDays}일 후</span>)
  }
  return badges.length ? <div className="flex gap-1 flex-wrap mt-1">{badges}</div> : null
}

// ─── 입력 컴포넌트 ────────────────────────────────────────────
function Field({ label, value, onChange, type = 'text', mono, placeholder, hint }: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; mono?: boolean; placeholder?: string; hint?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-24 shrink-0">{label}</span>
      <div className="flex-1">
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className={`w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 ${mono ? 'font-mono' : ''}`} />
        {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
      </div>
    </div>
  )
}

function SelectField({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void
}) {
  const isCustom = value !== '' && !options.includes(value)
  return (
    <div className="flex items-start gap-2">
      <span className="text-xs text-gray-500 w-24 shrink-0 pt-1.5">{label}</span>
      <div className="flex-1 space-y-1.5">
        <select
          value={isCustom ? '직접입력' : value}
          onChange={e => e.target.value === '직접입력' ? onChange('') : onChange(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">선택</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
          <option value="직접입력">직접입력</option>
        </select>
        {isCustom && (
          <input value={value} onChange={e => onChange(e.target.value)}
            placeholder="직접 입력"
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
        )}
      </div>
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
  const [portalInfo, setPortalInfo] = useState<{ phone: string; password: string } | null>(null)
  const [checkedIds, setCheckedIds] = useState<string[]>([])
  const [bulkCreating, setBulkCreating] = useState(false)
  const [visitWeekdays, setVisitWeekdays] = useState<number[]>([])
  const [visitMonthlyDates, setVisitMonthlyDates] = useState<number[]>([])

  const toggleCheck = (id: string) =>
    setCheckedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/customers')
    const data = await res.json()
    setCustomers(data.customers ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const toForm = (c: Customer): typeof EMPTY_FORM => ({
    business_name: c.business_name ?? '',
    contact_name: c.contact_name ?? '',
    contact_phone: c.contact_phone ?? '',
    email: c.email ?? '',
    address: c.address ?? '',
    address_detail: c.address_detail ?? '',
    business_number: c.business_number ?? '',
    account_number: c.account_number ?? '',
    platform_nickname: c.platform_nickname ?? '',
    payment_method: c.payment_method ?? '',
    elevator: c.elevator ?? '',
    building_access: c.building_access ?? '',
    access_method: c.access_method ?? '',
    business_hours_start: c.business_hours_start ?? '',
    business_hours_end: c.business_hours_end ?? '',
    door_password: c.door_password ?? '',
    parking_info: c.parking_info ?? '',
    special_notes: c.special_notes ?? '',
    care_scope: c.care_scope ?? '',
    customer_type: c.customer_type ?? '1회성케어',
    status: c.status ?? 'active',
    pipeline_status: c.pipeline_status ?? 'inquiry',
    billing_cycle: c.billing_cycle ?? '월간',
    billing_amount: c.billing_amount?.toString() ?? '',
    billing_start_date: c.billing_start_date ?? '',
    billing_next_date: c.billing_next_date ?? '',
    contract_start_date: c.contract_start_date ?? '',
    contract_end_date: c.contract_end_date ?? '',
    unit_price: c.unit_price?.toString() ?? '',
    visit_interval_days: c.visit_interval_days?.toString() ?? '',
    next_visit_date: c.next_visit_date ?? '',
    visit_schedule_type: c.visit_schedule_type ?? '',
    notes: c.notes ?? '',
  })

  const handleSelect = (c: Customer) => {
    setSelected(c); setIsNew(false); setNotifyType('')
    setForm(toForm(c))
    setVisitWeekdays(c.visit_weekdays ?? [])
    setVisitMonthlyDates(c.visit_monthly_dates ?? [])
  }

  const handleNew = () => {
    setSelected(null); setIsNew(true); setNotifyType('')
    setForm(EMPTY_FORM)
    setVisitWeekdays([])
    setVisitMonthlyDates([])
  }

  const set = (key: keyof typeof EMPTY_FORM) => (v: string) =>
    setForm(prev => {
      const next = { ...prev, [key]: v }
      // 정기엔드케어로 변경 시 billing_cycle = 월간 고정
      if (key === 'customer_type' && v === '정기엔드케어') next.billing_cycle = '월간'
      // 결제 시작일 or 주기 변경 시 다음 결제일 자동계산
      if ((key === 'billing_start_date' || key === 'billing_cycle') && next.billing_start_date && next.billing_cycle) {
        try { next.billing_next_date = calcNextBillingDate(next.billing_start_date, next.billing_cycle as BillingCycle) }
        catch { /* ignore */ }
      }
      return next
    })

  const buildBody = (): Record<string, unknown> => ({
    business_name: form.business_name.trim(),
    contact_name: form.contact_name || null,
    contact_phone: form.contact_phone || null,
    email: form.email || null,
    address: form.address || null,
    address_detail: form.address_detail || null,
    business_number: form.business_number || null,
    account_number: form.account_number || null,
    platform_nickname: form.platform_nickname || null,
    payment_method: form.payment_method || null,
    elevator: form.elevator || null,
    building_access: form.building_access || null,
    access_method: form.access_method || null,
    business_hours_start: form.business_hours_start || null,
    business_hours_end: form.business_hours_end || null,
    door_password: form.door_password || null,
    parking_info: form.parking_info || null,
    special_notes: form.special_notes || null,
    care_scope: form.care_scope || null,
    customer_type: form.customer_type,
    status: form.status,
    pipeline_status: form.pipeline_status || 'inquiry',
    billing_cycle: form.billing_cycle || null,
    billing_amount: form.billing_amount ? Number(form.billing_amount) : null,
    billing_start_date: form.billing_start_date || null,
    billing_next_date: form.billing_next_date || null,
    contract_start_date: form.contract_start_date || null,
    contract_end_date: form.contract_end_date || null,
    unit_price: form.unit_price ? Number(form.unit_price) : null,
    visit_interval_days: form.visit_interval_days ? Number(form.visit_interval_days) : null,
    next_visit_date: form.next_visit_date || null,
    visit_schedule_type: form.visit_schedule_type || null,
    visit_weekdays: visitWeekdays,
    visit_monthly_dates: visitMonthlyDates,
    notes: form.notes || null,
  })

  const handleSave = async () => {
    if (!form.business_name.trim()) { toast.error('업체명을 입력하세요.'); return }
    setSaving(true)
    try {
      const body = buildBody()
      if (isNew) {
        const res = await fetch('/api/admin/customers', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || '추가 실패')
        const newCustomer = data.customer as Customer
        setCustomers(prev => [newCustomer, ...prev])
        handleSelect(newCustomer)
        setIsNew(false)
        if (data.generatedPassword && form.contact_phone) {
          setPortalInfo({ phone: form.contact_phone, password: data.generatedPassword })
        } else {
          toast.success('고객이 추가되었습니다.')
        }
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
      setSelected(null); setIsNew(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '삭제 실패')
    }
  }

  // 고객 → 서비스 신청서 생성
  const handleCreateApplication = async () => {
    if (!selected) return
    const serviceType =
      selected.customer_type === '정기딥케어' ? '정기딥케어' :
      selected.customer_type === '정기엔드케어' ? '정기엔드케어' : '1회성케어'
    try {
      const res = await fetch('/api/admin/applications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: selected.business_name,
          owner_name: selected.contact_name || selected.business_name,
          platform_nickname: selected.platform_nickname,
          phone: selected.contact_phone,
          email: selected.email,
          address: selected.address,
          business_number: selected.business_number,
          account_number: selected.account_number,
          payment_method: selected.payment_method,
          business_hours_start: selected.business_hours_start,
          business_hours_end: selected.business_hours_end,
          elevator: selected.elevator,
          building_access: selected.building_access,
          parking: selected.parking_info,
          access_method: selected.access_method,
          request_notes: selected.special_notes,
          service_type: serviceType,
          admin_notes: `고객 DB에서 생성 (${new Date().toLocaleDateString('ko-KR')})`,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '생성 실패')
      toast.success('서비스 신청서가 생성되었습니다. 서비스 관리 탭에서 확인하세요.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '생성 실패')
    }
  }

  const handleDeleteBulk = async () => {
    if (checkedIds.length === 0) return
    if (!confirm(`선택한 ${checkedIds.length}건의 고객을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return
    setBulkCreating(true)
    let successCount = 0, failCount = 0
    for (const id of checkedIds) {
      try {
        const res = await fetch(`/api/admin/customers?id=${id}`, { method: 'DELETE' })
        if (res.ok) {
          successCount++
          if (selected?.id === id) { setSelected(null); setIsNew(false) }
        } else failCount++
      } catch { failCount++ }
    }
    setCustomers(prev => prev.filter(c => !checkedIds.includes(c.id)))
    setBulkCreating(false)
    setCheckedIds([])
    if (failCount === 0) toast.success(`${successCount}건 삭제되었습니다.`)
    else toast.error(`${successCount}건 성공, ${failCount}건 실패`)
  }

  const handleCreateApplicationBulk = async () => {
    if (checkedIds.length === 0) return
    setBulkCreating(true)
    const targets = customers.filter(c => checkedIds.includes(c.id))
    let successCount = 0
    let failCount = 0
    for (const c of targets) {
      const serviceType =
        c.customer_type === '정기딥케어' ? '정기딥케어' :
        c.customer_type === '정기엔드케어' ? '정기엔드케어' : '1회성케어'
      try {
        const res = await fetch('/api/admin/applications', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business_name: c.business_name,
            owner_name: c.contact_name || c.business_name,
            platform_nickname: c.platform_nickname,
            phone: c.contact_phone,
            email: c.email,
            address: c.address,
            business_number: c.business_number,
            account_number: c.account_number,
            payment_method: c.payment_method,
            business_hours_start: c.business_hours_start,
            business_hours_end: c.business_hours_end,
            elevator: c.elevator,
            building_access: c.building_access,
            parking: c.parking_info,
            access_method: c.access_method,
            request_notes: c.special_notes,
            service_type: serviceType,
            admin_notes: `고객 DB에서 생성 (${new Date().toLocaleDateString('ko-KR')})`,
          }),
        })
        if (res.ok) successCount++
        else failCount++
      } catch { failCount++ }
    }
    setBulkCreating(false)
    setCheckedIds([])
    if (failCount === 0) toast.success(`서비스 신청서 ${successCount}건이 생성되었습니다.`)
    else toast.error(`${successCount}건 성공, ${failCount}건 실패`)
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
  const isDipCare = form.customer_type === '정기딥케어'
  const notifyOptions = form.customer_type ? NOTIFY_TYPES[form.customer_type] : []

  return (
    <>
      {/* 탭 네비게이션 */}
      <div className="flex gap-1.5 px-1 mb-4">
        <a href="/admin/applications" className="px-4 py-2 text-gray-600 hover:bg-gray-100 text-sm font-medium rounded-xl transition-colors">📋 서비스통합관리</a>
        <span className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl">👥 고객관리</span>
      </div>

    <div className="relative flex h-full gap-0 min-h-0">
      {/* ── 좌측: 목록 ── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">고객 관리</h1>
          <div className="flex gap-2">
            <button onClick={fetchAll} className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50">새로고침</button>
            <button onClick={handleNew} className="px-3 py-1.5 text-sm bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
              + 고객 추가
            </button>
          </div>
        </div>

        {/* 타입 탭 */}
        <div className="flex border-b border-gray-200 mb-3">
          {(['전체', ...CUSTOMER_TYPES] as const).map(t => (
            <button key={t} onClick={() => setTypeTab(t)}
              className={`px-3 py-2.5 text-sm font-semibold transition-colors relative whitespace-nowrap ${typeTab === t ? 'text-blue-600 border-b-2 border-blue-600 -mb-px' : 'text-gray-500 hover:text-gray-700'}`}>
              {t}
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${typeTab === t ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                {typeCounts[t] ?? 0}
              </span>
            </button>
          ))}
        </div>

        {/* 액션 바 */}
        {checkedIds.length > 0 && (
          <div className="mb-3 flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl shadow-sm">
            <span className="text-sm font-semibold flex-1">{checkedIds.length}건 선택됨</span>
            <button onClick={() => setCheckedIds([])}
              className="text-xs text-blue-200 hover:text-white px-2 py-1 rounded transition-colors">
              선택 해제
            </button>
            <button onClick={handleDeleteBulk} disabled={bulkCreating}
              className="text-xs bg-red-500 hover:bg-red-400 text-white font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap">
              삭제
            </button>
            <button onClick={handleCreateApplicationBulk} disabled={bulkCreating}
              className="text-xs bg-white text-blue-700 font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-50 disabled:opacity-50 transition-colors whitespace-nowrap">
              {bulkCreating ? '처리 중...' : '서비스 신청서 생성 →'}
            </button>
          </div>
        )}

        {/* 검색 */}
        <div className="relative mb-3">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="업체명, 담당자, 연락처, 주소 검색..."
            className="w-full pl-8 pr-8 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">✕</button>}
        </div>

        {/* 목록 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-auto flex-1">
          {loading ? (
            <div className="py-20 text-center text-gray-400 text-sm">불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center text-gray-400 text-sm">{search ? `"${search}" 검색 결과 없음` : '고객이 없습니다.'}</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filtered.map(c => {
                const type = (c.customer_type ?? '1회성케어') as CustomerType
                const tStyle = TYPE_STYLE[type]
                const sStyle = STATUS_STYLE[c.status ?? 'active']
                const isSelected = selected?.id === c.id
                const isChecked = checkedIds.includes(c.id)
                return (
                  <div key={c.id}
                    className={`px-4 py-3 hover:bg-blue-50 transition-colors ${isSelected ? 'bg-blue-50 border-l-2 border-blue-500' : ''} ${isChecked ? 'bg-blue-50' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <div onClick={e => { e.stopPropagation(); toggleCheck(c.id) }} className="mt-0.5 shrink-0 cursor-pointer p-0.5">
                          <input type="checkbox" checked={isChecked} readOnly
                            className="accent-blue-600 pointer-events-none" />
                        </div>
                        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => handleSelect(c)}>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-semibold text-gray-900 truncate">{c.business_name}</p>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${tStyle.badge}`}>{type}</span>
                          {c.status !== 'active' && (
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${sStyle.badge}`}>{sStyle.label}</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{c.contact_name} · {c.contact_phone}</p>
                        {(c.billing_next_date || c.next_visit_date) && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {c.billing_next_date && `결제 ${fmtDate(c.billing_next_date)}`}
                            {c.billing_next_date && c.next_visit_date && '  '}
                            {c.next_visit_date && `방문 ${fmtDate(c.next_visit_date)}`}
                          </p>
                        )}
                        <StatusBadges customer={c} />
                      </div>
                    </div>
                      {/* 금액 요약 */}
                      <div className="text-right shrink-0 space-y-0.5">
                        {c.billing_amount != null && (
                          <p className="text-xs font-semibold text-gray-700">{fmt(c.billing_amount)}원<span className="text-gray-400 font-normal">/{c.billing_cycle === '연간' ? '년' : '월'}</span></p>
                        )}
                        {type === '정기엔드케어' && c.unit_price != null && (
                          <p className="text-xs text-purple-600 font-medium">{fmt(c.unit_price)}원/건</p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>

      {/* ── 우측: 상세 패널 (오버레이) ── */}
      {(selected || isNew) && (
        <div className="absolute right-0 top-0 bottom-0 w-[480px] bg-white rounded-xl border border-gray-200 shadow-2xl overflow-y-auto z-20">

          {/* 헤더 */}
          <div className="p-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
            <h2 className="font-bold text-gray-900 truncate">{isNew ? '새 고객 추가' : selected?.business_name}</h2>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => { setSelected(null); setIsNew(false) }} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
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
                      form.customer_type === t
                        ? `${TYPE_STYLE[t].badge} ring-2 ring-offset-1 ring-current`
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>{t}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5">
                {(['active', 'paused', 'terminated'] as CustomerStatus[]).map(s => (
                  <button key={s} onClick={() => set('status')(s)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      form.status === s
                        ? `${STATUS_STYLE[s].badge} ring-2 ring-offset-1 ring-current`
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>{STATUS_STYLE[s].label}
                  </button>
                ))}
              </div>
            </div>

            {/* 기본 정보 */}
            <div className="bg-gray-50 rounded-xl p-4 flex flex-col gap-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">기본 정보</p>
              <Field label="업체명 *" value={form.business_name} onChange={set('business_name')} />
              <Field label="대표자명" value={form.contact_name} onChange={set('contact_name')} />
              <Field label="플랫폼 닉네임" value={form.platform_nickname} onChange={set('platform_nickname')} placeholder="네이버, 카카오 등" />
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-24 shrink-0">연락처</span>
                <div className="flex flex-1 gap-1">
                  <input value={form.contact_phone} onChange={e => set('contact_phone')(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <a href={`tel:${form.contact_phone}`} className="px-2 py-1.5 text-xs bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100">📞</a>
                </div>
              </div>
              <Field label="이메일" value={form.email} onChange={set('email')} />
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-24 shrink-0">주소</span>
                <div className="flex flex-1 gap-1">
                  <input value={form.address} onChange={e => set('address')(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button onClick={() => window.open(`https://map.kakao.com/link/search/${encodeURIComponent(form.address)}`, '_blank')}
                    className="px-2 py-1.5 text-xs bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100 shrink-0">🗺️</button>
                </div>
              </div>
              <Field label="상세주소" value={form.address_detail} onChange={set('address_detail')} />
              <Field label="사업자번호" value={form.business_number} onChange={set('business_number')} mono />
              <Field label="계좌번호" value={form.account_number} onChange={set('account_number')} mono />
              <SelectField label="결제방법" value={form.payment_method} options={PAYMENT_METHODS} onChange={set('payment_method')} />
              {/* 영업시간 */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-24 shrink-0">영업시간</span>
                <div className="flex items-center gap-1 flex-1">
                  <input type="time" value={form.business_hours_start} onChange={e => set('business_hours_start')(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <span className="text-gray-400 text-xs">~</span>
                  <input type="time" value={form.business_hours_end} onChange={e => set('business_hours_end')(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <SelectField label="엘리베이터" value={form.elevator} options={ELEVATOR_OPTIONS} onChange={set('elevator')} />
              <SelectField label="건물출입" value={form.building_access} options={BUILDING_ACCESS_OPTIONS} onChange={set('building_access')} />
              <SelectField label="주차" value={form.parking_info} options={PARKING_OPTIONS} onChange={set('parking_info')} />
              <Field label="출입방법" value={form.access_method} onChange={set('access_method')} placeholder="출입 방법 메모" />
              <Field label="출입번호" value={form.door_password} onChange={set('door_password')} placeholder="도어락 비밀번호" />
              {/* 요청사항 */}
              <div className="flex items-start gap-2">
                <span className="text-xs text-gray-500 w-24 shrink-0 pt-1.5">요청사항</span>
                <textarea value={form.special_notes} onChange={e => set('special_notes')(e.target.value)} rows={2}
                  className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              {/* 케어범위 */}
              <div className="flex items-start gap-2">
                <span className="text-xs text-gray-500 w-24 shrink-0 pt-1.5">케어범위</span>
                <textarea value={form.care_scope} onChange={e => set('care_scope')(e.target.value)} rows={3}
                  placeholder="케어 범위를 입력하세요&#10;예) 주방, 화장실 2개, 사무실 전체"
                  className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
            </div>

            {/* ── 정기엔드케어 계약 ── */}
            {isEndCare && (
              <div className="rounded-xl border border-purple-200 overflow-hidden">
                <div className="bg-purple-50 px-4 py-2.5 border-b border-purple-200">
                  <p className="text-xs font-semibold text-purple-800">정기엔드케어 계약 정보</p>
                </div>
                <div className="p-4 flex flex-col gap-4">
                  {/* 고객 → 범빌드코리아 */}
                  <div className="bg-white border border-purple-100 rounded-lg p-3 flex flex-col gap-2">
                    <p className="text-xs font-semibold text-gray-700">고객 → 범빌드코리아 (월 결제 고정)</p>
                    <Field label="월 계약 금액" value={form.billing_amount} onChange={set('billing_amount')} type="number"
                      placeholder="0" hint="고객이 매월 범빌드코리아에 지불하는 금액" />
                  </div>

                  {/* 건당 급여 */}
                  <div className="bg-white border border-indigo-100 rounded-lg p-3 flex flex-col gap-2">
                    <p className="text-xs font-semibold text-gray-700">건당 급여</p>
                    <Field label="건당 급여" value={form.unit_price} onChange={set('unit_price')} type="number"
                      placeholder="0" hint="서비스 통합관리로 이관 시 1회 자동 매핑됩니다 (이후 서비스 통합관리에서 개별 수정 가능)" />
                    {form.unit_price && (
                      <div className="text-xs text-indigo-600 bg-indigo-50 rounded p-2">
                        예) 5건 작업 시 → {(Number(form.unit_price) * 5).toLocaleString('ko-KR')}원
                      </div>
                    )}
                  </div>

                  {/* 결제 일정 */}
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold text-gray-700">결제 일정</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-24 shrink-0">결제 시작일</span>
                      <input type="date" value={form.billing_start_date} onChange={e => set('billing_start_date')(e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-24 shrink-0">다음 결제일</span>
                      <input type="date" value={form.billing_next_date} onChange={e => set('billing_next_date')(e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                      {form.billing_start_date && (
                        <button onClick={() => {
                          try { set('billing_next_date')(calcNextBillingDate(form.billing_start_date, '월간')) }
                          catch { /* ignore */ }
                        }} className="text-xs text-purple-600 border border-purple-200 rounded px-2 py-1 hover:bg-purple-50">자동</button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-24 shrink-0">계약 시작</span>
                      <input type="date" value={form.contract_start_date} onChange={e => set('contract_start_date')(e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-24 shrink-0">계약 만료</span>
                      <input type="date" value={form.contract_end_date} onChange={e => set('contract_end_date')(e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                    </div>
                  </div>

                  {/* 방문 주기 */}
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold text-gray-700">방문 일정</p>
                    <VisitScheduleEditor
                      scheduleType={form.visit_schedule_type}
                      weekdays={visitWeekdays}
                      monthlyDates={visitMonthlyDates}
                      onScheduleTypeChange={set('visit_schedule_type')}
                      onWeekdaysChange={setVisitWeekdays}
                      onMonthlyDatesChange={setVisitMonthlyDates}
                      color="purple"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-24 shrink-0">다음 방문일</span>
                      <input type="date" value={form.next_visit_date} onChange={e => set('next_visit_date')(e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── 정기딥케어 계약 ── */}
            {isDipCare && (
              <div className="rounded-xl border border-blue-200 overflow-hidden">
                <div className="bg-blue-50 px-4 py-2.5 border-b border-blue-200">
                  <p className="text-xs font-semibold text-blue-800">정기딥케어 계약 정보</p>
                </div>
                <div className="p-4 flex flex-col gap-4">
                  {/* 고객 → 범빌드코리아 */}
                  <div className="bg-white border border-blue-100 rounded-lg p-3 flex flex-col gap-3">
                    <p className="text-xs font-semibold text-gray-700">고객 → 범빌드코리아</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-24 shrink-0">결제 주기</span>
                      <div className="flex gap-1.5 flex-1">
                        {(['월간', '연간'] as BillingCycle[]).map(c => (
                          <button key={c} onClick={() => set('billing_cycle')(c)}
                            className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                              form.billing_cycle === c ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}>{c}</button>
                        ))}
                      </div>
                    </div>
                    <Field label="계약 금액" value={form.billing_amount} onChange={set('billing_amount')} type="number"
                      placeholder="0" hint={form.billing_cycle === '연간' ? '연간 계약 총 금액' : '매월 결제 금액'} />
                    {form.billing_cycle === '연간' && form.billing_amount && (
                      <p className="text-xs text-blue-600 bg-blue-50 rounded p-2">
                        월 환산: {Math.round(Number(form.billing_amount) / 12).toLocaleString('ko-KR')}원/월
                      </p>
                    )}
                  </div>

                  {/* 급여 안내 */}
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-xs text-amber-700 font-semibold">작업자 급여</p>
                    <p className="text-xs text-amber-600 mt-1">정기딥케어 작업자 급여는 건별로 별도 책정됩니다. 서비스 관리 &gt; 작업자 배정에서 개별 급여를 입력하세요.</p>
                  </div>

                  {/* 결제 일정 */}
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold text-gray-700">결제 일정</p>
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
                          try { set('billing_next_date')(calcNextBillingDate(form.billing_start_date, form.billing_cycle as BillingCycle)) }
                          catch { /* ignore */ }
                        }} className="text-xs text-blue-600 border border-blue-200 rounded px-2 py-1 hover:bg-blue-50">자동</button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-24 shrink-0">계약 시작</span>
                      <input type="date" value={form.contract_start_date} onChange={e => set('contract_start_date')(e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-24 shrink-0">계약 만료</span>
                      <input type="date" value={form.contract_end_date} onChange={e => set('contract_end_date')(e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                    </div>
                  </div>

                  {/* 방문 주기 */}
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold text-gray-700">방문 일정</p>
                    <VisitScheduleEditor
                      scheduleType={form.visit_schedule_type}
                      weekdays={visitWeekdays}
                      monthlyDates={visitMonthlyDates}
                      onScheduleTypeChange={set('visit_schedule_type')}
                      onWeekdaysChange={setVisitWeekdays}
                      onMonthlyDatesChange={setVisitMonthlyDates}
                      color="blue"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-24 shrink-0">다음 방문일</span>
                      <input type="date" value={form.next_visit_date} onChange={e => set('next_visit_date')(e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* D-day 요약 (정기케어) */}
            {isRegular && (form.billing_next_date || form.contract_end_date) && (
              <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
                {form.billing_next_date && (() => {
                  const days = daysUntil(form.billing_next_date)
                  return (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">다음 결제까지</span>
                      <span className={`font-semibold ${days != null && days < 0 ? 'text-red-600' : days != null && days <= 7 ? 'text-orange-600' : 'text-gray-700'}`}>
                        {days == null ? '-' : days < 0 ? `${Math.abs(days)}일 지남` : `${days}일 후 (${fmtDate(form.billing_next_date)})`}
                      </span>
                    </div>
                  )
                })()}
                {form.contract_end_date && (() => {
                  const days = daysUntil(form.contract_end_date)
                  return (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">계약 만료까지</span>
                      <span className={`font-semibold ${days != null && days < 0 ? 'text-red-600' : days != null && days <= 30 ? 'text-yellow-600' : 'text-gray-700'}`}>
                        {days == null ? '-' : days < 0 ? '계약 만료됨' : `${days}일 후 (${fmtDate(form.contract_end_date)})`}
                      </span>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* 메모 */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">메모</p>
              <textarea value={form.notes} onChange={e => set('notes')(e.target.value)}
                rows={2} placeholder="내부 메모를 입력하세요..."
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>

            {/* 저장 버튼 */}
            <button onClick={handleSave} disabled={saving}
              className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors">
              {saving ? '저장 중...' : isNew ? '✚ 고객 추가' : '💾 저장'}
            </button>

            {/* 알림 발송 (정기케어만) */}
            {!isNew && selected && isRegular && (
              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <p className="text-xs font-semibold text-gray-500 px-4 py-2.5 bg-gray-50 border-b border-gray-100">결제 · 방문 알림 발송</p>
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
                    <div className="px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-700 space-y-0.5">
                      <p><span className="font-semibold">{notifyType}</span> → {selected.contact_phone}</p>
                      {notifyType === '정기결제알림' && selected.billing_next_date && (
                        <p className="text-orange-500">결제일: {fmtDate(selected.billing_next_date)} · {fmt(selected.billing_amount)}원</p>
                      )}
                      {notifyType === '정기방문알림' && selected.next_visit_date && (
                        <p className="text-orange-500">방문 예정: {fmtDate(selected.next_visit_date)}</p>
                      )}
                      {notifyType === '계약갱신알림' && selected.contract_end_date && (
                        <p className="text-orange-500">계약 만료: {fmtDate(selected.contract_end_date)}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 요청사항 이력 + 담당자 메모 관리 */}
            {!isNew && selected && (
              <CustomerRequestsPanel customerId={selected.id} />
            )}
          </div>
        </div>
      )}

      {/* 포털 계정 자동 생성 결과 모달 */}
      {portalInfo && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-4">
            <div className="text-center">
              <div className="text-3xl mb-2">🎉</div>
              <h3 className="font-bold text-gray-900">고객 포털 계정이 생성됐습니다</h3>
              <p className="text-xs text-gray-500 mt-1">고객에게 아래 로그인 정보를 전달해주세요.</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 w-16 shrink-0">아이디</span>
                <span className="font-mono text-sm font-semibold text-gray-800 flex-1 text-right">{portalInfo.phone}</span>
                <button
                  onClick={() => { navigator.clipboard.writeText(portalInfo.phone); toast.success('복사됨') }}
                  className="ml-2 text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-100 transition-colors"
                >복사</button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 w-16 shrink-0">비밀번호</span>
                <span className="font-mono text-sm font-semibold text-gray-800 flex-1 text-right tracking-widest">{portalInfo.password}</span>
                <button
                  onClick={() => { navigator.clipboard.writeText(portalInfo.password); toast.success('복사됨') }}
                  className="ml-2 text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-100 transition-colors"
                >복사</button>
              </div>
            </div>
            <p className="text-xs text-gray-400 text-center">이 창을 닫으면 비밀번호를 다시 확인할 수 없습니다.</p>
            <button
              onClick={() => setPortalInfo(null)}
              className="w-full py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
    </>
  )
}
