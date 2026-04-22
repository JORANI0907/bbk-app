'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import toast from 'react-hot-toast'
import { useModalBackButton } from '@/hooks/useModalBackButton'
import { MapSelectorModal } from '@/components/MapSelectorModal'
import { BillingHistoryPanel } from '@/components/admin/BillingHistoryPanel'

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
  schedule_generation_day?: number | null
  notes: string | null
  rotation_type: '3개월' | '6개월' | '12개월' | null
  visit_count_per_month: number | null
  payment_status: string[] | null
  payment_date: number | null
  assigned_user_id: string | null
  assigned_worker_id: string | null
  // 결제 금액 (서비스관리와 동기화)
  deposit: number | null
  supply_amount: number | null
  vat: number | null
  balance: number | null
  created_at: string
  updated_at: string
}

// ─── 상수 ─────────────────────────────────────────────────────
const CUSTOMER_TYPES: CustomerType[] = ['1회성케어', '정기딥케어', '정기엔드케어']
const PAYMENT_METHODS = ['현금', '카드', '계좌이체', '현금(부가세 X)']
const ROTATION_TYPES = ['3개월', '6개월', '12개월'] as const
const PAYMENT_STATUS_OPTIONS = ['미수령', '수령완료', '세금계산서발행', '결제완료']
const ELEVATOR_OPTIONS = ['있음', '없음', '해당없음']
const BUILDING_ACCESS_OPTIONS = ['신청필요', '신청불필요', '해당없음']
const PARKING_OPTIONS = ['가능', '불가능', '주차없음']

const NOTIFY_TYPES: Record<CustomerType, string[]> = {
  '1회성케어':    ['방문견적알림'],
  '정기딥케어':   ['정기결제알림', '정기방문알림', '계약갱신알림', '계정안내알림'],
  '정기엔드케어': ['정기결제알림', '정기방문알림', '계약갱신알림', '계정안내알림'],
}

// 비과세 결제방법 여부 (부가세 0)
const isNoVatMethod = (method: string | null | undefined): boolean =>
  !!method && (method.includes('비과세') || method.includes('미희망') || method === '현금(부가세 X)')

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
  supply_amount: '',
  vat: '',
  billing_start_date: '', billing_next_date: '',
  contract_start_date: '', contract_end_date: '',
  unit_price: '',
  visit_interval_days: '',
  visit_schedule_type: '', notes: '',
  next_visit_date: '',
  rotation_type: '' as '' | '3개월' | '6개월' | '12개월',
  visit_count_per_month: '',
  payment_status: [] as string[],
  payment_date: '',
  assigned_user_id: '',
  assigned_worker_id: '',
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

function calcNextBillingDate(startDate: string, cycle: BillingCycle, prepaidPeriods = 1): string {
  const monthsPerPeriod = cycle === '월간' ? 1 : 12
  const next = new Date(startDate)
  next.setMonth(next.getMonth() + monthsPerPeriod * prepaidPeriods)
  return next.toISOString().slice(0, 10)
}

function getPrepaidMonthLabels(startDate: string, cycle: BillingCycle, prepaidPeriods: number): string {
  if (!startDate || prepaidPeriods < 1) return ''
  const monthsPerPeriod = cycle === '월간' ? 1 : 12
  const labels: string[] = []
  for (let i = 0; i < prepaidPeriods; i++) {
    const d = new Date(startDate)
    d.setMonth(d.getMonth() + monthsPerPeriod * i)
    if (cycle === '월간') {
      labels.push(`${d.getMonth() + 1}월`)
    } else {
      labels.push(`${d.getFullYear()}년`)
    }
  }
  return labels.join(', ')
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
          className={`w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 ${mono ? 'font-mono' : ''}`} />
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
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">선택</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
          <option value="직접입력">직접입력</option>
        </select>
        {isCustom && (
          <input value={value} onChange={e => onChange(e.target.value)}
            placeholder="직접 입력"
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        )}
      </div>
    </div>
  )
}

// ─── 메인 페이지 ──────────────────────────────────────────────
export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTypes, setSelectedTypes] = useState<Set<CustomerType>>(new Set())
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Customer | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [form, setForm] = useState<typeof EMPTY_FORM>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [notifyType, setNotifyType] = useState('')
  const [sending, setSending] = useState(false)
  const [checkedIds, setCheckedIds] = useState<string[]>([])
  const [bulkCreating, setBulkCreating] = useState(false)
  const [visitWeekdays, setVisitWeekdays] = useState<number[]>([])
  const [visitMonthlyDates, setVisitMonthlyDates] = useState<number[]>([])
  const [prepaidPeriods, setPrepaidPeriods] = useState(1)
  // 현재 사용자 세션
  const [currentRole, setCurrentRole] = useState<string>('admin')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const isWorker = currentRole === 'worker'
  const isAdmin = currentRole === 'admin'

  // 담당자/작업자 목록
  const [usersList, setUsersList] = useState<Array<{ id: string; name: string; role: string }>>([])
  const [workersList, setWorkersList] = useState<Array<{ id: string; name: string }>>([])

  // 지도 앱 선택 모달
  const [mapAddress, setMapAddress] = useState<string | null>(null)

  // 세부화면 닫기
  const closeDetail = useCallback(() => { setSelected(null); setIsNew(false) }, [])

  // 모바일 뒤로가기 → 세부화면만 닫기
  useModalBackButton(!!(selected || isNew), closeDetail)

  const toggleCheck = (id: string) =>
    setCheckedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/customers')
    const data = await res.json()
    setCustomers(data.customers ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (d.user) {
        setCurrentRole(d.user.role ?? 'admin')
        setCurrentUserId(d.user.userId ?? null)
      }
    }).catch(() => { /* 무시 */ })
    fetch('/api/admin/users').then(r => r.json()).then(d => setUsersList(d.users ?? [])).catch(() => {})
    fetch('/api/admin/workers').then(r => r.json()).then(d => setWorkersList(d.workers ?? [])).catch(() => {})
  }, [fetchAll])

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
    supply_amount: c.supply_amount?.toString() ?? '',
    vat: c.vat?.toString() ?? '',
    billing_start_date: c.billing_start_date ?? '',
    billing_next_date: c.billing_next_date ?? '',
    contract_start_date: c.contract_start_date ?? '',
    contract_end_date: c.contract_end_date ?? '',
    unit_price: c.unit_price?.toString() ?? '',
    visit_interval_days: c.visit_interval_days?.toString() ?? '',
    visit_schedule_type: c.visit_schedule_type ?? '',
    notes: c.notes ?? '',
    next_visit_date: c.next_visit_date ?? '',
    rotation_type: (c.rotation_type ?? '') as '' | '3개월' | '6개월' | '12개월',
    visit_count_per_month: c.visit_count_per_month?.toString() ?? '',
    payment_status: c.payment_status ?? [],
    payment_date: c.payment_date?.toString() ?? '',
    assigned_user_id: c.assigned_user_id ?? '',
    assigned_worker_id: c.assigned_worker_id ?? '',
  })

  const handleSelect = (c: Customer) => {
    setSelected(c); setIsNew(false); setNotifyType('')
    setForm(toForm(c))
    setVisitWeekdays(c.visit_weekdays ?? [])
    setVisitMonthlyDates(c.visit_monthly_dates ?? [])
    setPrepaidPeriods(1)
  }

  const handleNew = () => {
    setSelected(null); setIsNew(true); setNotifyType('')
    setForm(EMPTY_FORM)
    setVisitWeekdays([])
    setVisitMonthlyDates([])
    setPrepaidPeriods(1)
  }

  const set = (key: keyof typeof EMPTY_FORM) => (v: string) =>
    setForm(prev => {
      const next = { ...prev, [key]: v }
      // 결제 시작일 or 주기 변경 시 다음 결제일 자동계산
      if ((key === 'billing_start_date' || key === 'billing_cycle') && next.billing_start_date && next.billing_cycle) {
        try { next.billing_next_date = calcNextBillingDate(next.billing_start_date, next.billing_cycle as BillingCycle) }
        catch { /* ignore */ }
      }
      // 공급가액 변경 시 부가세 자동계산 (비과세 아닌 경우)
      if (key === 'supply_amount' && !isNoVatMethod(next.payment_method)) {
        next.vat = String(Math.round((Number(v) || 0) * 0.1))
      }
      // 결제방법 변경 시 부가세 자동 처리
      if (key === 'payment_method') {
        if (isNoVatMethod(v)) {
          next.vat = '0'
        } else if (next.supply_amount) {
          next.vat = String(Math.round((Number(next.supply_amount) || 0) * 0.1))
        }
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
    supply_amount: form.supply_amount ? Number(form.supply_amount) : null,
    vat: (() => {
      if (isNoVatMethod(form.payment_method)) return 0
      return form.vat ? Number(form.vat) : null
    })(),
    billing_amount: (() => {
      const s = Number(form.supply_amount) || 0
      const v = isNoVatMethod(form.payment_method) ? 0 : (Number(form.vat) || 0)
      return s > 0 ? s + v : null
    })(),
    billing_start_date: form.billing_start_date || null,
    billing_next_date: form.billing_next_date || null,
    contract_start_date: form.contract_start_date || null,
    contract_end_date: form.contract_end_date || null,
    unit_price: form.unit_price ? Number(form.unit_price) : null,
    visit_interval_days: form.visit_interval_days ? Number(form.visit_interval_days) : null,
    visit_schedule_type: form.visit_schedule_type || null,
    visit_weekdays: visitWeekdays,
    visit_monthly_dates: visitMonthlyDates,
    notes: form.notes || null,
    rotation_type: form.rotation_type || null,
    visit_count_per_month: form.visit_count_per_month ? Number(form.visit_count_per_month) : null,
    payment_status: form.payment_status.length > 0 ? form.payment_status : null,
    payment_date: form.payment_date ? Number(form.payment_date) : null,
    assigned_user_id: form.assigned_user_id || null,
    assigned_worker_id: form.assigned_worker_id || null,
  })

  const autoGenerateBillings = (customerId: string) => {
    const eligible =
      (form.customer_type === '정기딥케어' && form.billing_cycle === '연간') ||
      form.customer_type === '정기엔드케어'
    if (!eligible || !form.contract_start_date || !form.billing_amount) return
    fetch('/api/admin/customers/generate-billings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_ids: [customerId] }),
    }).then(async res => {
      const data = await res.json()
      if (res.ok && data.totalInserted > 0) {
        toast.success(`청구 ${data.totalInserted}건이 자동 생성되었습니다.`)
      }
    }).catch(() => {})
  }

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
        toast.success('고객이 추가되었습니다.')
        autoGenerateBillings(newCustomer.id)
      } else if (selected) {
        const res = await fetch('/api/admin/customers', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: selected.id, ...body }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || '저장 실패')
        toast.success('저장되었습니다.')
        const updated = (data.customer ?? { ...selected, ...body }) as Customer
        setCustomers(prev => prev.map(c => c.id === selected.id ? updated : c))
        setSelected(updated)
        setForm(toForm(updated))
        setVisitWeekdays(updated.visit_weekdays ?? [])
        setVisitMonthlyDates(updated.visit_monthly_dates ?? [])
        autoGenerateBillings(selected.id)
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
          // 일반정보
          business_name: selected.business_name,
          owner_name: selected.contact_name || selected.business_name,
          platform_nickname: selected.platform_nickname,
          phone: selected.contact_phone,
          email: selected.email,
          business_number: selected.business_number,
          account_number: selected.account_number,
          // 작업장정보
          address: selected.address,
          elevator: selected.elevator,
          building_access: selected.building_access,
          parking: selected.parking_info,
          access_method: selected.access_method,
          business_hours_start: selected.business_hours_start,
          business_hours_end: selected.business_hours_end,
          // 시공정보
          care_scope: selected.care_scope,
          request_notes: selected.special_notes,
          // 결제정보
          payment_method: selected.payment_method,
          unit_price_per_visit: (serviceType === '정기딥케어' || serviceType === '정기엔드케어') ? (selected.unit_price ?? null) : null,
          deposit: selected.deposit,
          supply_amount: selected.supply_amount,
          vat: selected.vat,
          balance: selected.balance,
          // 메타
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

  const handleGenerateSchedulesBulk = async () => {
    const regularIds = checkedIds.filter(id => {
      const c = customers.find(c => c.id === id)
      return c?.customer_type === '정기딥케어' || c?.customer_type === '정기엔드케어'
    })
    if (regularIds.length === 0) {
      toast.error('정기딥케어 또는 정기엔드케어 고객을 선택해주세요.')
      return
    }
    setBulkCreating(true)
    try {
      const res = await fetch('/api/admin/customers/generate-schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_ids: regularIds }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '일정 생성 실패')
      const totalSkipped = (data.results as Array<{ skipped: number }>).reduce((s, r) => s + r.skipped, 0)
      if (data.totalInserted === 0 && totalSkipped > 0) {
        toast(`${data.targetMonth} 일정이 이미 모두 생성되어 있습니다. (${totalSkipped}건 중복)`, { icon: 'ℹ️' })
      } else if (data.totalInserted === 0) {
        toast.error(`방문 주기가 설정되지 않아 생성할 일정이 없습니다.`)
      } else {
        const msg = totalSkipped > 0
          ? `${data.targetMonth} 일정 ${data.totalInserted}건 생성 완료 (${totalSkipped}건 이미 존재)`
          : `${data.targetMonth} 일정 ${data.totalInserted}건 생성 완료`
        toast.success(msg)
      }
      setCheckedIds([])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '일정 생성 실패')
    } finally { setBulkCreating(false) }

    // 폴더 자동 생성 (fire-and-forget: 실패해도 일정 생성은 완료된 것으로 처리)
    const now = new Date()
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    for (const id of regularIds) {
      fetch(`/api/admin/customers/${id}/create-schedule-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: nextMonth.getFullYear(), month: nextMonth.getMonth() + 1 }),
      }).catch(() => { /* 폴더 생성 실패는 무시 */ })
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
            // 일반정보
            business_name: c.business_name,
            owner_name: c.contact_name || c.business_name,
            platform_nickname: c.platform_nickname,
            phone: c.contact_phone,
            email: c.email,
            business_number: c.business_number,
            account_number: c.account_number,
            // 작업장정보
            address: c.address,
            elevator: c.elevator,
            building_access: c.building_access,
            parking: c.parking_info,
            access_method: c.access_method,
            business_hours_start: c.business_hours_start,
            business_hours_end: c.business_hours_end,
            // 시공정보
            care_scope: c.care_scope,
            request_notes: c.special_notes,
            // 결제정보
            payment_method: c.payment_method,
            unit_price_per_visit: (serviceType === '정기딥케어' || serviceType === '정기엔드케어') ? (c.unit_price ?? null) : null,
            deposit: c.deposit,
            supply_amount: c.supply_amount,
            vat: c.vat,
            balance: c.balance,
            // 메타
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

    // 비관리자: 담당자(assigned_user_id)가 자신인 고객만
    if (!isAdmin && currentUserId) {
      list = list.filter(c => c.assigned_user_id === currentUserId)
    }

    // 서비스 유형 복수 필터 (비어있으면 전체)
    if (selectedTypes.size > 0) {
      list = list.filter(c => selectedTypes.has((c.customer_type ?? '1회성케어') as CustomerType))
    }

    // 검색: 업체명, 고객명, 연락처, 주소, 케어범위, 계좌번호, 사업자번호
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(c =>
        c.business_name.toLowerCase().includes(q) ||
        (c.contact_name ?? '').toLowerCase().includes(q) ||
        (c.contact_phone ?? '').toLowerCase().includes(q) ||
        (c.address ?? '').toLowerCase().includes(q) ||
        (c.care_scope ?? '').toLowerCase().includes(q) ||
        (c.account_number ?? '').toLowerCase().includes(q) ||
        (c.business_number ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [customers, isAdmin, currentUserId, selectedTypes, search])

  const toggleType = (t: CustomerType) => {
    setSelectedTypes(prev => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  const typeCounts = useMemo(() => {
    const base = (!isAdmin && currentUserId)
      ? customers.filter(c => c.assigned_user_id === currentUserId)
      : customers
    const counts: Record<string, number> = { '전체': base.length }
    for (const t of CUSTOMER_TYPES) counts[t] = base.filter(c => (c.customer_type ?? '1회성케어') === t).length
    return counts
  }, [customers, isAdmin, currentUserId])

  const isRegular = form.customer_type === '정기딥케어' || form.customer_type === '정기엔드케어'
  const isEndCare = form.customer_type === '정기엔드케어'
  const isDipCare = form.customer_type === '정기딥케어'
  const notifyOptions = form.customer_type ? NOTIFY_TYPES[form.customer_type] : []

  return (
    <>
    <div className="relative flex h-full gap-0 min-h-0">
      {/* ── 좌측: 목록 ── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">고객 관리</h1>
          <div className="flex gap-2">
            <button onClick={fetchAll} className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50">새로고침</button>
            {!isWorker && (
              <button onClick={handleNew} className="px-3 py-1.5 text-sm bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
                + 고객 추가
              </button>
            )}
          </div>
        </div>

        {/* 서비스 유형 체크박스 복수선택 */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className="text-xs text-gray-500 self-center mr-0.5">유형</span>
          {CUSTOMER_TYPES.map(t => {
            const checked = selectedTypes.has(t)
            return (
              <button key={t} onClick={() => toggleType(t)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  checked ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'
                }`}>
                <span>{t}</span>
                <span className={`text-xs px-1 py-0.5 rounded-full ${checked ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {typeCounts[t] ?? 0}
                </span>
              </button>
            )
          })}
          {selectedTypes.size > 0 && (
            <button onClick={() => setSelectedTypes(new Set())}
              className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg bg-white">
              전체 ({typeCounts['전체'] ?? 0})
            </button>
          )}
        </div>

        {/* 액션 바 */}
        {checkedIds.length > 0 && (
          <div className="mb-3 flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl shadow-sm">
            <span className="text-sm font-semibold flex-1">{checkedIds.length}건 선택됨</span>
            <button onClick={() => setCheckedIds([])}
              className="text-xs text-blue-200 hover:text-white px-2 py-1 rounded transition-colors">
              선택 해제
            </button>
            {!isWorker && (
              <button onClick={handleDeleteBulk} disabled={bulkCreating}
                className="text-xs bg-red-500 hover:bg-red-400 text-white font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap">
                삭제
              </button>
            )}
            <button onClick={handleGenerateSchedulesBulk} disabled={bulkCreating}
              className="text-xs bg-green-600 hover:bg-green-700 text-white font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap">
              {bulkCreating ? '처리 중...' : '📅 다음달 일정 생성'}
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
            className="w-full pl-8 pr-8 py-1.5 text-xs text-gray-900 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">✕</button>}
        </div>

        {/* 목록 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-auto flex-1">
          {loading ? (
            <div className="py-20 text-center text-gray-400 text-sm">불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center text-gray-400 text-sm">{search ? `"${search}" 검색 결과 없음` : '고객이 없습니다.'}</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-3 w-8"></th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">업체명 / 연락처</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">서비스</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">상태</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">계약기간</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">방문주기</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">방문일정</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(c => {
                  const type = (c.customer_type ?? '1회성케어') as CustomerType
                  const tStyle = TYPE_STYLE[type]
                  const sStyle = STATUS_STYLE[c.status ?? 'active']
                  const isSelected = selected?.id === c.id
                  const isChecked = checkedIds.includes(c.id)
                  const visitIntervalText = (() => {
                    if (type === '정기딥케어') {
                      const parts: string[] = []
                      if (c.rotation_type) parts.push(`${c.rotation_type} 순환`)
                      if (c.visit_count_per_month) parts.push(`월 ${c.visit_count_per_month}회`)
                      return parts.join(' · ')
                    }
                    return ''
                  })()
                  const visitScheduleText = (() => {
                    if (c.visit_schedule_type === 'weekday' && c.visit_weekdays?.length)
                      return `매 ${WEEKDAYS.filter(w => c.visit_weekdays!.includes(w.value)).map(w => w.label).join('·')}요일`
                    if (c.visit_schedule_type === 'monthly_date' && c.visit_monthly_dates?.length)
                      return `매월 ${[...c.visit_monthly_dates].sort((a, b) => a - b).join('·')}일`
                    return ''
                  })()
                  return (
                    <tr key={c.id}
                      className={`hover:bg-blue-50 transition-colors cursor-pointer ${isSelected ? 'bg-blue-50 border-l-2 border-blue-500' : ''} ${isChecked ? 'bg-blue-50' : ''}`}
                      onClick={() => handleSelect(c)}>
                      <td className="px-3 py-3" onClick={e => { e.stopPropagation(); toggleCheck(c.id) }}>
                        <input type="checkbox" checked={isChecked} readOnly className="accent-blue-600 pointer-events-none cursor-pointer" />
                      </td>
                      <td className="px-3 py-3 min-w-[160px]">
                        <p className="text-sm font-semibold text-gray-900">{c.business_name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{c.contact_name} · {c.contact_phone}</p>
                        {(c.billing_next_date || c.next_visit_date) && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {c.billing_next_date && `결제 ${fmtDate(c.billing_next_date)}`}
                            {c.billing_next_date && c.next_visit_date && '  '}
                            {c.next_visit_date && `방문 ${fmtDate(c.next_visit_date)}`}
                          </p>
                        )}
                        <StatusBadges customer={c} />
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${tStyle.badge}`}>{type}</span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${sStyle.badge}`}>{sStyle.label}</span>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {(c.contract_start_date || c.contract_end_date)
                          ? <>{fmtDate(c.contract_start_date)} ~ {fmtDate(c.contract_end_date)}</>
                          : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {visitIntervalText || <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {visitScheduleText || <span className="text-gray-300">-</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

      </div>

      {/* 지도 앱 선택 모달 */}
      {mapAddress && (
        <MapSelectorModal address={mapAddress} onClose={() => setMapAddress(null)} />
      )}

      {/* ── 우측: 상세 패널 (오버레이) ── */}
      {(selected || isNew) && (
        <>
          {/* PC: 외부 클릭 시 닫기 / 모바일: full-screen 뒤 배경 */}
          <div
            className="fixed inset-0 z-[55] md:absolute md:inset-0 md:z-[15]"
            onClick={closeDetail}
          />
        <div className="fixed inset-x-0 top-0 bottom-0 z-[60] md:absolute md:inset-x-auto md:right-0 md:top-0 md:bottom-0 md:w-[480px] bg-white md:rounded-xl md:border md:border-gray-200 shadow-2xl overflow-y-auto">

          {/* 헤더 */}
          <div className="p-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
            <h2 className="font-bold text-gray-900 break-words">{isNew ? '새 고객 추가' : selected?.business_name}</h2>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={closeDetail} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>
          </div>

          <div className="p-4 pb-24 md:pb-8 space-y-5">
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

            {/* 담당직원 */}
            <div className="bg-gray-50 rounded-xl p-4 flex flex-col gap-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">담당직원</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-24 shrink-0">담당자</span>
                <select value={form.assigned_user_id} onChange={e => set('assigned_user_id')(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="">담당자 없음</option>
                  {usersList.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.role === 'admin' ? '관리자' : '직원'})</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-24 shrink-0">작업자</span>
                <select value={form.assigned_worker_id} onChange={e => set('assigned_worker_id')(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="">작업자 없음</option>
                  {workersList.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 일반정보 */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">일반정보</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-20 shrink-0">고객명</span>
                  <input value={form.contact_name} onChange={e => set('contact_name')(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-20 shrink-0">업체명</span>
                  <input value={form.business_name} onChange={e => set('business_name')(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-20 shrink-0">연락처</span>
                  <div className="flex flex-1 gap-1">
                    <input value={form.contact_phone} onChange={e => set('contact_phone')(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <a href={`tel:${form.contact_phone}`} className="px-2 py-1.5 text-xs bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100">📞</a>
                    <button onClick={() => navigator.clipboard.writeText(form.contact_phone).then(() => toast.success('연락처 복사됨'))} className="px-2 py-1.5 text-xs bg-gray-50 rounded-lg hover:bg-gray-100">📋</button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-20 shrink-0">이메일</span>
                  <input value={form.email} onChange={e => set('email')(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-20 shrink-0">주소</span>
                  <div className="flex flex-1 gap-1">
                    <input value={form.address} onChange={e => set('address')(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <button onClick={() => setMapAddress(form.address)}
                      className="px-2 py-1.5 text-xs bg-green-50 text-green-700 rounded-lg hover:bg-green-100 shrink-0">🗺️</button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-20 shrink-0">영업시간</span>
                  <div className="flex items-center gap-1 flex-1">
                    <input type="time" value={form.business_hours_start} onChange={e => set('business_hours_start')(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <span className="text-gray-400 text-xs">~</span>
                    <input type="time" value={form.business_hours_end} onChange={e => set('business_hours_end')(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              </div>
            </div>

            {/* 작업장정보 */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">작업장정보</p>
              <div className="border-2 border-green-200 rounded-xl p-3 space-y-2 bg-green-50/30">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-20 shrink-0">주차</span>
                  <input value={form.parking_info} onChange={e => set('parking_info')(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-20 shrink-0">건물출입</span>
                  <input value={form.building_access} onChange={e => set('building_access')(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-20 shrink-0">엘리베이터</span>
                  <input value={form.elevator} onChange={e => set('elevator')(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-20 shrink-0">출입방법</span>
                  <input value={form.access_method} onChange={e => set('access_method')(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </div>

            {/* 시공정보 */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">시공정보</p>
              <div className="border-2 border-green-200 rounded-xl p-3 space-y-2 bg-green-50/30">
                <div className="flex items-start gap-2">
                  <span className="text-xs text-gray-500 w-20 shrink-0 pt-1.5">케어범위</span>
                  <textarea value={form.care_scope} onChange={e => set('care_scope')(e.target.value)} rows={3}
                    placeholder="예) - 후드청소&#10;- 덕트청소&#10;- 계단청소"
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 resize-none text-gray-900" />
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-xs text-gray-500 w-20 shrink-0 pt-1.5">요청사항</span>
                  <textarea value={form.special_notes} onChange={e => set('special_notes')(e.target.value)} rows={2}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 resize-none text-gray-900" />
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-xs text-gray-500 w-20 shrink-0 pt-1.5">관리자메모</span>
                  <textarea value={form.notes} onChange={e => set('notes')(e.target.value)} rows={3}
                    placeholder="내부 메모를 입력하세요..."
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 resize-none text-gray-900" />
                </div>
              </div>
            </div>

            {/* 결제정보 — worker 숨김 */}
            {!isWorker && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">결제정보</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-20 shrink-0">결제방법</span>
                  <select value={form.payment_method} onChange={e => set('payment_method')(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    <option value="">선택...</option>
                    <option value="현금(계산서 희망)">현금(계산서 희망)</option>
                    <option value="현금(비과세)">현금(비과세)</option>
                    <option value="카드(온라인 간편결제)">카드(온라인 간편결제)</option>
                    <option value="플랫폼">플랫폼</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-20 shrink-0">계좌번호</span>
                  <div className="flex flex-1 gap-1">
                    <input value={form.account_number} onChange={e => set('account_number')(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
                    <button onClick={() => navigator.clipboard.writeText(form.account_number).then(() => toast.success('계좌번호 복사됨'))} className="px-2 py-1.5 text-xs bg-gray-50 rounded-lg hover:bg-gray-100">📋</button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-20 shrink-0">사업자번호</span>
                  <div className="flex flex-1 gap-1">
                    <input value={form.business_number} onChange={e => set('business_number')(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
                    <button onClick={() => navigator.clipboard.writeText(form.business_number).then(() => toast.success('사업자번호 복사됨'))} className="px-2 py-1.5 text-xs bg-gray-50 rounded-lg hover:bg-gray-100">📋</button>
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* ── 정기엔드케어 계약 — worker 숨김 ── */}
            {!isWorker && isEndCare && (
              <div className="rounded-xl border border-purple-200 overflow-hidden">
                <div className="bg-purple-50 px-4 py-2.5 border-b border-purple-200">
                  <p className="text-xs font-semibold text-purple-800">정기엔드케어 계약 정보</p>
                </div>
                <div className="p-4 flex flex-col gap-4">
                  {/* 고객 → 범빌드코리아 */}
                  <div className="bg-white border border-purple-100 rounded-lg p-3 flex flex-col gap-3">
                    <p className="text-xs font-semibold text-gray-700">고객 → 범빌드코리아</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-24 shrink-0">결제 주기</span>
                      <div className="flex gap-1.5 flex-1">
                        {(['월간', '연간'] as BillingCycle[]).map(c => (
                          <button key={c} onClick={() => set('billing_cycle')(c)}
                            className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                              form.billing_cycle === c ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}>{c}</button>
                        ))}
                      </div>
                    </div>
                    {/* 금액 섹션 */}
                    {isNoVatMethod(form.payment_method) && (
                      <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-xs text-amber-700 font-semibold">💵 현금 결제 — 부가세 미적용</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 mb-0.5 block">
                          공급가액 <span className="text-gray-400">({form.billing_cycle === '연간' ? '연간' : '월간'})</span>
                        </label>
                        <input type="number" value={form.supply_amount} onChange={e => set('supply_amount')(e.target.value)}
                          placeholder="0"
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 text-gray-900" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-0.5 block">
                          부가세 {isNoVatMethod(form.payment_method) ? <span className="text-gray-400">(비적용)</span> : <span className="text-gray-400">(자동 10%)</span>}
                        </label>
                        <input type="number"
                          value={isNoVatMethod(form.payment_method) ? '0' : form.vat}
                          onChange={e => set('vat')(e.target.value)}
                          disabled={isNoVatMethod(form.payment_method)}
                          placeholder="0"
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 text-gray-900 disabled:bg-gray-50 disabled:text-gray-400" />
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-xs pt-1 border-t border-gray-100">
                      <span className="text-gray-500">총액 (공급가액 + 부가세)</span>
                      <span className="font-bold text-gray-800">
                        {((Number(form.supply_amount) || 0) + (isNoVatMethod(form.payment_method) ? 0 : (Number(form.vat) || 0))).toLocaleString('ko-KR')}원
                      </span>
                    </div>
                    {form.billing_cycle === '연간' && form.supply_amount && (
                      <p className="text-xs text-purple-600 bg-purple-50 rounded p-2">
                        월 환산: {Math.round(((Number(form.supply_amount) || 0) + (isNoVatMethod(form.payment_method) ? 0 : (Number(form.vat) || 0))) / 12).toLocaleString('ko-KR')}원/월
                      </p>
                    )}
                  </div>

                  {/* 계약기간 */}
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold text-gray-700">계약기간</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-24 shrink-0">계약 시작</span>
                      <input type="date" value={form.contract_start_date} onChange={e => set('contract_start_date')(e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-gray-900" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-24 shrink-0">계약 만료</span>
                      <input type="date" value={form.contract_end_date} onChange={e => set('contract_end_date')(e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-gray-900" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-24 shrink-0">결제일자</span>
                      <input type="number" min={1} max={31} value={form.payment_date}
                        onChange={e => set('payment_date')(e.target.value)}
                        placeholder="1~31"
                        className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 text-center text-gray-900" />
                      <span className="text-xs text-gray-400">일</span>
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
                  </div>
                </div>
              </div>
            )}

            {/* ── 정기딥케어 계약 — worker 숨김 ── */}
            {!isWorker && isDipCare && (
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
                    {/* 금액 섹션 */}
                    {isNoVatMethod(form.payment_method) && (
                      <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-xs text-amber-700 font-semibold">💵 현금 결제 — 부가세 미적용</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 mb-0.5 block">
                          공급가액 <span className="text-gray-400">({form.billing_cycle === '연간' ? '연간' : '월간'})</span>
                        </label>
                        <input type="number" value={form.supply_amount} onChange={e => set('supply_amount')(e.target.value)}
                          placeholder="0"
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-900" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-0.5 block">
                          부가세 {isNoVatMethod(form.payment_method) ? <span className="text-gray-400">(비적용)</span> : <span className="text-gray-400">(자동 10%)</span>}
                        </label>
                        <input type="number"
                          value={isNoVatMethod(form.payment_method) ? '0' : form.vat}
                          onChange={e => set('vat')(e.target.value)}
                          disabled={isNoVatMethod(form.payment_method)}
                          placeholder="0"
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-900 disabled:bg-gray-50 disabled:text-gray-400" />
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-xs pt-1 border-t border-gray-100">
                      <span className="text-gray-500">총액 (공급가액 + 부가세)</span>
                      <span className="font-bold text-gray-800">
                        {((Number(form.supply_amount) || 0) + (isNoVatMethod(form.payment_method) ? 0 : (Number(form.vat) || 0))).toLocaleString('ko-KR')}원
                      </span>
                    </div>
                    {form.billing_cycle === '연간' && form.supply_amount && (
                      <p className="text-xs text-blue-600 bg-blue-50 rounded p-2">
                        월 환산: {Math.round(((Number(form.supply_amount) || 0) + (isNoVatMethod(form.payment_method) ? 0 : (Number(form.vat) || 0))) / 12).toLocaleString('ko-KR')}원/월
                      </p>
                    )}
                  </div>

                  {/* 순환식 / 월 회수 */}
                  <div className="bg-white border border-blue-100 rounded-lg p-3 flex flex-col gap-3">
                    <p className="text-xs font-semibold text-gray-700">방문 주기 설정</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-24 shrink-0">순환식</span>
                      <div className="flex gap-1.5 flex-1">
                        {ROTATION_TYPES.map(r => (
                          <button key={r} onClick={() => set('rotation_type')(r)}
                            className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                              form.rotation_type === r ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}>{r}</button>
                        ))}
                        {form.rotation_type && (
                          <button onClick={() => set('rotation_type')('')}
                            className="px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600 rounded-lg bg-gray-50 hover:bg-gray-100">✕</button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-24 shrink-0">월 회수</span>
                      <input type="number" min={1} max={31} value={form.visit_count_per_month}
                        onChange={e => set('visit_count_per_month')(e.target.value)}
                        placeholder="0"
                        className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-center" />
                      <span className="text-xs text-gray-400">회/월</span>
                    </div>
                  </div>

                  {/* 급여 안내 */}
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-xs text-amber-700 font-semibold">작업자 급여</p>
                    <p className="text-xs text-amber-600 mt-1">정기딥케어 작업자 급여는 건별로 별도 책정됩니다. 서비스 관리 &gt; 작업자 배정에서 개별 급여를 입력하세요.</p>
                  </div>

                  {/* 계약기간 */}
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold text-gray-700">계약기간</p>
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

            {/* 저장 버튼 — worker는 읽기 전용 */}
            {!isWorker && (
              <button onClick={handleSave} disabled={saving}
                className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors">
                {saving ? '저장 중...' : isNew ? '✚ 고객 추가' : '💾 저장'}
              </button>
            )}
            {isWorker && (
              <div className="w-full py-2.5 bg-gray-100 text-gray-600 text-sm font-semibold rounded-lg text-center">
                읽기 전용 (수정 권한 없음)
              </div>
            )}

            {/* 청구 이력 (정기딥케어 연간 / 정기엔드케어) */}
            {!isNew && selected && (
              (form.customer_type === '정기딥케어' && form.billing_cycle === '연간') ||
              form.customer_type === '정기엔드케어'
            ) && (
              <BillingHistoryPanel
                customerId={selected.id}
                customerType={form.customer_type}
                billingCycle={form.billing_cycle}
                billingAmount={(() => {
                  const s = Number(form.supply_amount) || 0
                  const v = isNoVatMethod(form.payment_method) ? 0 : (Number(form.vat) || 0)
                  return s > 0 ? s + v : (form.billing_amount ? Number(form.billing_amount) : null)
                })()}
                paymentDay={form.payment_date ? Number(form.payment_date) : null}
                contractStartDate={form.contract_start_date || null}
                contractEndDate={form.contract_end_date || null}
              />
            )}

            {/* 알림 발송 (정기케어만, 관리자만) */}
            {!isWorker && !isNew && selected && isRegular && (
              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <p className="text-xs font-semibold text-gray-500 px-4 py-2.5 bg-gray-50 border-b border-gray-100">고객 알림 발송</p>
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
                      {notifyType === '계정안내알림' && (
                        <p className="text-orange-500">ID: {selected.contact_name || selected.business_name} · PW: {(selected.contact_phone ?? '').replace(/-/g, '')}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
        </>
      )}

    </div>
    </>
  )
}
