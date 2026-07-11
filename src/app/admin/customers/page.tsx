'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { useModalBackButton } from '@/hooks/useModalBackButton'
import { MapSelectorModal } from '@/components/MapSelectorModal'
import { BillingHistoryPanel } from '@/components/admin/BillingHistoryPanel'
import { BillingSummary } from '@/components/admin/BillingSummary'
import { Button } from '@/components/ui'
import { Phone, ClipboardList, Map, Banknote, Save, Megaphone, Calendar, BookOpen } from 'lucide-react'
import { CustomerAccountLink } from '@/components/admin/CustomerAccountLink'

// ─── 타입 ─────────────────────────────────────────────────────
type CustomerType = '1회성케어' | '정기딥케어' | '정기엔드케어' | '정기딥케어샘플' | '정기엔드케어샘플'
type CustomerStatus = 'active' | 'paused' | 'terminated'
type CustomerDisposition = '호의' | '보통' | '주의'
type CustomerGrade = '화이트' | '블루' | '블랙'
type BillingCycle = '월간' | '연간'

interface Customer {
  id: string
  business_name: string
  contact_name: string
  contact_phone: string
  contact_phone_2: string | null
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
  admin_notes: string | null
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
  disposition: CustomerDisposition | null
  grade: CustomerGrade | null
  rotation_type: string | null
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
  // 포털 계정
  user_id: string | null
  // 이 계약을 함께 볼 수 있는 다른 로그인 계정(정기딥+정기엔드 통합 뷰). NULL이면 서브 계약 아님.
  account_user_id: string | null
  created_at: string
  updated_at: string
}

// ─── 상수 ─────────────────────────────────────────────────────
const CUSTOMER_TYPES: CustomerType[] = ['정기엔드케어', '정기딥케어', '1회성케어', '정기엔드케어샘플', '정기딥케어샘플']

// 영업용 샘플 계정 유형 (필터 '샘플계정' 통합 대상)
const SAMPLE_TYPES: CustomerType[] = ['정기엔드케어샘플', '정기딥케어샘플']

// 리스트 상단 필터 옵션 (편집 폼 유형과 별도 — 두 샘플은 '샘플계정' 하나로 그룹핑)
type FilterOption = '정기엔드케어' | '정기딥케어' | '1회성케어' | '샘플계정'
const FILTER_OPTIONS: FilterOption[] = ['정기엔드케어', '정기딥케어', '1회성케어', '샘플계정']

// 필터 옵션 → 실제 customer_type 매칭 판별 (모듈 스코프 헬퍼 — 렌더 순서 무관)
function matchesCustomerFilter(customerType: CustomerType, filter: FilterOption): boolean {
  if (filter === '샘플계정') return SAMPLE_TYPES.includes(customerType)
  return customerType === filter
}
const PAYMENT_METHODS = ['현금', '카드', '계좌이체', '현금(부가세 X)']
const PAYMENT_STATUS_OPTIONS = ['미수령', '수령완료', '세금계산서발행', '결제완료']
const ELEVATOR_OPTIONS = ['있음', '없음', '해당없음']
const BUILDING_ACCESS_OPTIONS = ['신청필요', '신청불필요', '해당없음']
const PARKING_OPTIONS = ['가능', '불가능', '주차없음']

const NOTIFY_TYPES: Record<CustomerType, string[]> = {
  '1회성케어':    ['방문견적알림'],
  '정기딥케어':   ['정기결제알림', '정기방문알림', '계약갱신알림', '계정안내알림'],
  '정기엔드케어': ['정기결제알림', '정기방문알림', '계약갱신알림', '계정안내알림'],
  // 샘플 유형 — 영업용이라 실 알림 발송 없음
  '정기엔드케어샘플': [],
  '정기딥케어샘플':   [],
}

// 비과세 결제방법 여부 (부가세 0)
const isNoVatMethod = (method: string | null | undefined): boolean =>
  !!method && (method.includes('비과세') || method.includes('미희망') || method === '현금(부가세 X)')

const TYPE_STYLE: Record<CustomerType, { badge: string; accent: string }> = {
  '1회성케어':    { badge: 'bg-surface-sunken text-text-primary',     accent: 'border-border bg-surface-sunken' },
  '정기딥케어':   { badge: 'bg-brand-100 text-brand-700',     accent: 'border-brand-200 bg-brand-50' },
  '정기엔드케어': { badge: 'bg-purple-100 text-purple-700', accent: 'border-purple-200 bg-purple-50' },
  // 샘플 유형 — 앰버 톤으로 구분 (실 고객과 시각적 대비)
  '정기엔드케어샘플': { badge: 'bg-amber-100 text-amber-700', accent: 'border-amber-200 bg-amber-50' },
  '정기딥케어샘플':   { badge: 'bg-amber-100 text-amber-700', accent: 'border-amber-200 bg-amber-50' },
}

const STATUS_STYLE: Record<CustomerStatus, { badge: string; label: string }> = {
  active:     { badge: 'bg-emerald-100 text-emerald-700', label: '활성' },
  paused:     { badge: 'bg-amber-100 text-amber-700',     label: '일시중지' },
  terminated: { badge: 'bg-state-danger-bg text-state-danger',         label: '해지' },
}

const GRADE_STYLE: Record<CustomerGrade, { badge: string; label: string }> = {
  '화이트': { badge: 'bg-gray-100 text-gray-700',   label: '화이트' },
  '블루':   { badge: 'bg-sky-100 text-sky-700',     label: '블루' },
  '블랙':   { badge: 'bg-gray-900 text-white',       label: '블랙' },
}

const DISPOSITION_STYLE: Record<string, { badge: string; label: string }> = {
  '호의':  { badge: 'bg-sky-100 text-sky-700',   label: '호의' },
  '보통':  { badge: 'bg-surface-sunken text-text-secondary', label: '보통' },
  '주의':  { badge: 'bg-state-warning-bg text-state-warning', label: '주의' },
  '블랙':  { badge: 'bg-state-danger-bg text-state-danger',  label: '블랙' },  // 하위호환
}

const EMPTY_FORM = {
  business_name: '', contact_name: '', contact_phone: '', contact_phone_2: '', email: '',
  address: '', address_detail: '', business_number: '', account_number: '',
  platform_nickname: '', payment_method: '',
  elevator: '', building_access: '', access_method: '',
  business_hours_start: '', business_hours_end: '',
  door_password: '', parking_info: '', special_notes: '', admin_notes: '', care_scope: '',
  customer_type: '1회성케어' as CustomerType,
  status: 'active' as CustomerStatus,
  disposition: '보통' as CustomerDisposition,
  grade: '' as CustomerGrade | '',
  pipeline_status: 'inquiry',
  billing_cycle: '월간' as BillingCycle,
  billing_amount: '',
  supply_amount: '',
  vat: '',
  deposit: '',
  balance: '',
  billing_start_date: '', billing_next_date: '',
  contract_start_date: '', contract_end_date: '',
  unit_price: '',
  visit_interval_days: '',
  visit_schedule_type: '', notes: '',
  next_visit_date: '',
  rotation_type: '',
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
function StatusBadges({ customer, hideContract }: { customer: Customer; hideContract?: boolean }) {
  const billingDays = daysUntil(customer.billing_next_date)
  const visitDays   = daysUntil(customer.next_visit_date)
  const contractDays = daysUntil(customer.contract_end_date)
  const badges: React.ReactNode[] = []

  if (billingDays != null) {
    if (billingDays < 0)
      badges.push(<span key="b0" className="text-xs px-1.5 py-0.5 bg-state-danger-bg text-state-danger rounded-full font-medium">결제지연 {Math.abs(billingDays)}일</span>)
    else if (billingDays <= 7)
      badges.push(<span key="b1" className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-full font-medium">결제 {billingDays}일 후</span>)
  }
  if (visitDays != null && visitDays >= 0 && visitDays <= 5)
    badges.push(<span key="v" className="text-xs px-1.5 py-0.5 bg-brand-100 text-brand-700 rounded-full font-medium">방문 {visitDays}일 후</span>)
  if (!hideContract && contractDays != null) {
    if (contractDays < 0)
      badges.push(<span key="c0" className="text-xs px-1.5 py-0.5 bg-state-danger-bg text-state-danger rounded-full font-medium">계약만료</span>)
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
      <span className="text-xs text-text-secondary w-24 shrink-0">{label}</span>
      <div className="flex-1">
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className={`w-full border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500 ${mono ? 'font-mono' : ''}`} />
        {hint && <p className="text-xs text-text-tertiary mt-0.5">{hint}</p>}
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
      <span className="text-xs text-text-secondary w-24 shrink-0 pt-1.5">{label}</span>
      <div className="flex-1 space-y-1.5">
        <select
          value={isCustom ? '직접입력' : value}
          onChange={e => e.target.value === '직접입력' ? onChange('') : onChange(e.target.value)}
          className="w-full border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface"
        >
          <option value="">선택</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
          <option value="직접입력">직접입력</option>
        </select>
        {isCustom && (
          <input value={value} onChange={e => onChange(e.target.value)}
            placeholder="직접 입력"
            className="w-full border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500" />
        )}
      </div>
    </div>
  )
}

// ─── 메인 페이지 ──────────────────────────────────────────────
export default function AdminCustomersPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [customers, setCustomers] = useState<Customer[]>([])
  // 리스트 미리보기용 최신 청구 요약 (customer_id → 대표 청구 record)
  const [latestBillings, setLatestBillings] = useState<Record<string, {
    id: string
    billing_type: 'monthly' | 'annual'
    billing_period: string
    status: 'pending' | 'paid' | 'overdue'
    paid_date: string | null
    tax_invoice_issued: boolean | null
    tax_invoice_issued_date: string | null
  }>>({})
  // BillingSummary/리스트 뱃지 재조회 트리거 — 편집 폼에서 청구 변경 시 증가
  const [billingRefreshKey, setBillingRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selectedTypes, setSelectedTypes] = useState<Set<FilterOption>>(new Set(['정기엔드케어']))
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Customer | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [form, setForm] = useState<typeof EMPTY_FORM>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [notifyType, setNotifyType] = useState('')
  const [sending, setSending] = useState(false)
  const [checkedIds, setCheckedIds] = useState<string[]>([])
  const [bulkCreating, setBulkCreating] = useState(false)
  const [scheduleGenModal, setScheduleGenModal] = useState<{
    open: boolean
    year: number
    month: number
    startDay: number
    submitting: boolean
  }>({ open: false, year: 0, month: 0, startDay: 1, submitting: false })
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
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

  // 직원 필터 (정직원만)
  const [staffList, setStaffList] = useState<Array<{ id: string; name: string; user_id: string | null }>>([])
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null)

  // 지도 앱 선택 모달
  const [mapAddress, setMapAddress] = useState<string | null>(null)

  // 세부화면 닫기
  const closeDetail = useCallback(() => { setSelected(null); setIsNew(false) }, [])

  // 모바일 뒤로가기 → 세부화면만 닫기
  useModalBackButton(!!(selected || isNew), closeDetail)

  const toggleCheck = (id: string) =>
    setCheckedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/customers')
    const data = await res.json()
    setCustomers(data.customers ?? [])
    setLoading(false)
  }, [])

  // 케어매뉴얼 편집에서 돌아올 때 ?detail=ID 파라미터로 세부화면 복원
  useEffect(() => {
    const detailId = searchParams.get('detail')
    if (!detailId || customers.length === 0 || selected) return
    const target = customers.find(c => c.id === detailId)
    if (target) {
      setSelected(target)
      setIsNew(false)
      setForm(toForm(target))
      setVisitWeekdays(target.visit_weekdays ?? [])
      setVisitMonthlyDates(target.visit_monthly_dates ?? [])
      router.replace('/admin/customers', { scroll: false })
    }
  }, [customers, searchParams, selected, router])

  // 리스트 미리보기 청구 뱃지 갱신 — 편집 폼에서 청구 변경 시 부모가 호출
  const refetchLatestBillings = useCallback(() => {
    fetch('/api/admin/billings/latest')
      .then(r => r.json())
      .then(d => setLatestBillings(d.latest ?? {}))
      .catch(() => setLatestBillings({}))
    setBillingRefreshKey(k => k + 1)
  }, [])

  useEffect(() => {
    fetchAll()
    refetchLatestBillings()
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (d.user) {
        setCurrentRole(d.user.role ?? 'admin')
        setCurrentUserId(d.user.userId ?? null)
      }
    }).catch(() => { /* 무시 */ })
    fetch('/api/admin/users').then(r => r.json()).then(d => setUsersList(d.users ?? [])).catch(() => {})
    fetch('/api/admin/workers').then(r => r.json()).then(d => setWorkersList(d.workers ?? [])).catch(() => {})
    fetch('/api/admin/workers?employment_type=정직원').then(r => r.json()).then(d => {
      setStaffList((d.workers ?? []).map((w: { id: string; name: string; user_id?: string | null }) => ({
        id: w.id,
        name: w.name,
        user_id: w.user_id ?? null,
      })))
    }).catch(() => {})
  }, [fetchAll])

  const toForm = (c: Customer): typeof EMPTY_FORM => ({
    business_name: c.business_name ?? '',
    contact_name: c.contact_name ?? '',
    contact_phone: c.contact_phone ?? '',
    contact_phone_2: c.contact_phone_2 ?? '',
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
    admin_notes: c.admin_notes ?? '',
    care_scope: c.care_scope ?? '',
    customer_type: c.customer_type ?? '1회성케어',
    status: c.status ?? 'active',
    disposition: (c.disposition ?? '보통') as CustomerDisposition,
    grade: (c.grade ?? '') as CustomerGrade | '',
    pipeline_status: c.pipeline_status ?? 'inquiry',
    billing_cycle: c.billing_cycle ?? '월간',
    billing_amount: c.billing_amount?.toString() ?? '',
    supply_amount: c.supply_amount?.toString() ?? '',
    vat: c.vat?.toString() ?? '',
    deposit: c.deposit?.toString() ?? '',
    balance: c.balance?.toString() ?? '',
    billing_start_date: c.billing_start_date ?? '',
    billing_next_date: c.billing_next_date ?? '',
    contract_start_date: c.contract_start_date ?? '',
    contract_end_date: c.contract_end_date ?? '',
    unit_price: c.unit_price?.toString() ?? '',
    visit_interval_days: c.visit_interval_days?.toString() ?? '',
    visit_schedule_type: c.visit_schedule_type ?? '',
    notes: c.notes ?? '',
    next_visit_date: c.next_visit_date ?? '',
    rotation_type: c.rotation_type ?? '',
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
      // 잔금 자동계산: 공급가액+부가세-예약금
      if (['supply_amount', 'vat', 'deposit', 'payment_method'].includes(key as string)) {
        const s = Number(next.supply_amount) || 0
        const vv = isNoVatMethod(next.payment_method) ? 0 : (Number(next.vat) || 0)
        const d = Number(next.deposit) || 0
        next.balance = String(Math.max(0, s + vv - d))
      }
      return next
    })

  const buildBody = (): Record<string, unknown> => ({
    business_name: form.business_name.trim(),
    contact_name: form.contact_name || null,
    contact_phone: form.contact_phone || null,
    contact_phone_2: form.contact_phone_2 || null,
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
    admin_notes: form.admin_notes || null,
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
    deposit: form.deposit !== '' ? Number(form.deposit) : null,
    balance: form.balance !== '' ? Number(form.balance) : null,
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
    disposition: form.disposition ?? '보통',
    grade: form.grade || null,
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
          admin_request_notes: selected.admin_notes,
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

  /**
   * 서비스 일정 생성 버튼 클릭 — 유효성 검사 후 모달 오픈만 담당.
   * 실제 생성은 handleGenerateSchedulesBulk(year, month, startDay)에서 처리.
   */
  const openScheduleGenModal = () => {
    const regularIds = checkedIds.filter(id => {
      const c = customers.find(c => c.id === id)
      return c?.customer_type === '정기딥케어' || c?.customer_type === '정기엔드케어'
    })
    if (regularIds.length === 0) {
      toast.error('정기딥케어 또는 정기엔드케어 고객을 선택해주세요.')
      return
    }
    const noManagerCustomers = regularIds
      .map(id => customers.find(c => c.id === id))
      .filter((c): c is NonNullable<typeof c> => !!c && !c.assigned_user_id)
    if (noManagerCustomers.length > 0) {
      const names = noManagerCustomers.map(c => c.business_name).join(', ')
      toast.error(`${names} 담당자 설정이 안되어있습니다.`)
      return
    }
    // 기본값: 다음달 1일
    const now = new Date()
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    setScheduleGenModal({
      open: true,
      year: next.getFullYear(),
      month: next.getMonth() + 1,
      startDay: 1,
      submitting: false,
    })
  }

  const handleGenerateSchedulesBulk = async (year: number, month: number, startDay: number) => {
    const regularIds = checkedIds.filter(id => {
      const c = customers.find(c => c.id === id)
      return c?.customer_type === '정기딥케어' || c?.customer_type === '정기엔드케어'
    })
    if (regularIds.length === 0) return

    setBulkCreating(true)
    setScheduleGenModal((s) => ({ ...s, submitting: true }))
    try {
      const res = await fetch('/api/admin/customers/generate-schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_ids: regularIds, year, month, start_day: startDay }),
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
          ? `${data.targetMonth} ${startDay}일부터 ${data.totalInserted}건 생성 완료 (${totalSkipped}건 이미 존재)`
          : `${data.targetMonth} ${startDay}일부터 ${data.totalInserted}건 생성 완료`
        toast.success(msg)
      }
      setCheckedIds([])
      setScheduleGenModal((s) => ({ ...s, open: false, submitting: false }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '일정 생성 실패')
      setScheduleGenModal((s) => ({ ...s, submitting: false }))
    } finally { setBulkCreating(false) }

    // 폴더 자동 생성 (선택한 year/month 기준)
    for (const id of regularIds) {
      fetch(`/api/admin/customers/${id}/create-schedule-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month }),
      }).catch(() => { /* 폴더 생성 실패는 무시 */ })
    }
  }

  const handleDuplicateBulk = async () => {
    if (checkedIds.length === 0) return
    if (!confirm(`선택한 ${checkedIds.length}건의 고객을 복제하시겠습니까?\n\n복제본은 원본과 관계없는 별도 고객으로 생성됩니다 (드라이브 폴더·알림 이력·포털 계정 초기화).`)) return
    setBulkCreating(true)
    let successCount = 0, failCount = 0
    const newItems: Customer[] = []
    for (const id of checkedIds) {
      try {
        const res = await fetch(`/api/admin/customers/${id}/duplicate`, { method: 'POST' })
        const d = await res.json()
        if (res.ok && d.customer) {
          newItems.push(d.customer as Customer)
          successCount++
        } else failCount++
      } catch { failCount++ }
    }
    if (newItems.length > 0) {
      setCustomers(prev => [...newItems, ...prev])
    }
    setBulkCreating(false)
    setCheckedIds([])
    if (failCount === 0) toast.success(`${successCount}건 복제되었습니다.`)
    else toast.error(`${successCount}건 성공, ${failCount}건 실패`)
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
            admin_request_notes: c.admin_notes,
            // 결제정보 (연간 계약주기인 경우 금액 매핑 제외)
            payment_method: c.payment_method,
            unit_price_per_visit: (c.billing_cycle === '연간') ? null : ((serviceType === '정기딥케어' || serviceType === '정기엔드케어') ? (c.unit_price ?? null) : null),
            deposit: (c.billing_cycle === '연간') ? null : c.deposit,
            supply_amount: (c.billing_cycle === '연간') ? null : c.supply_amount,
            vat: (c.billing_cycle === '연간') ? null : c.vat,
            balance: (c.billing_cycle === '연간') ? null : c.balance,
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
      list = list.filter(c => {
        const ct = (c.customer_type ?? '1회성케어') as CustomerType
        for (const opt of selectedTypes) {
          if (matchesCustomerFilter(ct, opt)) return true
        }
        return false
      })
    }

    // 직원 필터 (담당자 또는 작업자)
    if (selectedStaffId) {
      const staff = staffList.find(s => s.id === selectedStaffId)
      if (staff) {
        list = list.filter(c =>
          (staff.user_id && c.assigned_user_id === staff.user_id) ||
          c.assigned_worker_id === staff.id
        )
      }
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
    if (sortKey) {
      const COLLATOR = new Intl.Collator('ko', { sensitivity: 'variant', numeric: true, caseFirst: 'lower' })
      list = [...list].sort((a, b) => {
        let av = '', bv = ''
        if (sortKey === 'business_name') {
          av = a.business_name ?? ''
          bv = b.business_name ?? ''
        } else if (sortKey === 'service') {
          av = a.customer_type ?? ''
          bv = b.customer_type ?? ''
        } else if (sortKey === 'contract') {
          av = a.contract_start_date ?? ''
          bv = b.contract_start_date ?? ''
        } else if (sortKey === 'interval') {
          const diff = (a.visit_interval_days ?? 0) - (b.visit_interval_days ?? 0)
          return sortDir === 'asc' ? diff : -diff
        } else if (sortKey === 'next_visit') {
          const scheduleText = (c: Customer) => {
            if (c.visit_schedule_type === 'weekday' && c.visit_weekdays?.length)
              return `매 ${WEEKDAYS.filter(w => c.visit_weekdays!.includes(w.value)).map(w => w.label).join('·')}요일`
            if (c.visit_schedule_type === 'monthly_date' && c.visit_monthly_dates?.length)
              return `매월 ${[...c.visit_monthly_dates].sort((x, y) => x - y).join('·')}일`
            return ''
          }
          av = scheduleText(a)
          bv = scheduleText(b)
        }
        const cmp = COLLATOR.compare(av, bv)
        return sortDir === 'asc' ? cmp : -cmp
      })
    }

    return list
  }, [customers, isAdmin, currentUserId, selectedTypes, search, sortKey, sortDir, selectedStaffId, staffList])

  const toggleType = (t: FilterOption) => {
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
    for (const opt of FILTER_OPTIONS) {
      counts[opt] = base.filter(c => matchesCustomerFilter((c.customer_type ?? '1회성케어') as CustomerType, opt)).length
    }
    return counts
  }, [customers, isAdmin, currentUserId])

  const isRegular = form.customer_type === '정기딥케어' || form.customer_type === '정기엔드케어'
  const isEndCare = form.customer_type === '정기엔드케어'
  const isDipCare = form.customer_type === '정기딥케어'
  const isOnceCare = form.customer_type === '1회성케어'
  const notifyOptions = form.customer_type ? (NOTIFY_TYPES[form.customer_type] ?? []) : []

  return (
    <>
    <div className="relative flex h-full gap-0 min-h-0">
      {/* ── 좌측: 목록 ── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-bold text-text-primary">고객 관리</h1>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={fetchAll}>새로고침</Button>
            {!isWorker && (
              <Button size="sm" onClick={handleNew}>+ 고객 추가</Button>
            )}
          </div>
        </div>


        {/* 서비스 유형 체크박스 복수선택 — 샘플계정은 정기딥/엔드케어샘플 통합 필터 */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className="text-xs text-text-secondary self-center mr-0.5">유형</span>
          {FILTER_OPTIONS.map(t => {
            const checked = selectedTypes.has(t)
            const isSample = t === '샘플계정'
            return (
              <button key={t} onClick={() => toggleType(t)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  checked
                    ? (isSample ? 'bg-amber-600 text-white border-amber-600' : 'bg-brand-600 text-white border-brand-600')
                    : (isSample ? 'bg-amber-50 text-amber-700 border-amber-200 hover:border-amber-400' : 'bg-surface text-text-secondary border-border hover:border-blue-400')
                }`}>
                <span>{t}</span>
                <span className={`text-xs px-1 py-0.5 rounded-full ${
                  checked
                    ? (isSample ? 'bg-amber-500 text-white' : 'bg-brand-500 text-white')
                    : 'bg-surface-sunken text-text-secondary'
                }`}>
                  {typeCounts[t] ?? 0}
                </span>
              </button>
            )
          })}
          <button onClick={() => setSelectedTypes(new Set())}
            className={`px-2 py-1 text-xs border rounded-lg transition-colors ${
              selectedTypes.size === 0
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-surface text-text-secondary border-border hover:border-blue-400'
            }`}>
            전체 ({typeCounts['전체'] ?? 0})
          </button>
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
              <Button size="sm" onClick={handleDuplicateBulk} disabled={bulkCreating} className="bg-yellow-500 hover:bg-yellow-400 text-white whitespace-nowrap">
                {bulkCreating ? '처리 중...' : '복제'}
              </Button>
            )}
            {!isWorker && (
              <Button variant="danger" size="sm" onClick={handleDeleteBulk} disabled={bulkCreating} className="whitespace-nowrap">
                삭제
              </Button>
            )}
            <Button size="sm" onClick={openScheduleGenModal} disabled={bulkCreating} className="bg-green-600 hover:bg-green-700 text-white whitespace-nowrap">
              {bulkCreating ? '처리 중...' : <><Calendar size={14} className="inline mr-1" />서비스 일정 생성</>}
            </Button>
            <Button size="sm" onClick={handleCreateApplicationBulk} disabled={bulkCreating} className="bg-blue-800 text-white hover:bg-blue-900 whitespace-nowrap">
              {bulkCreating ? '처리 중...' : '서비스 신청서 생성 →'}
            </Button>
          </div>
        )}

        {/* 검색 + 직원 필터 */}
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="업체명, 담당자, 연락처, 주소 검색..."
              className="w-full pl-8 pr-8 py-1.5 text-xs text-text-primary border border-border rounded-lg bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary">✕</button>}
          </div>
          <select
            value={selectedStaffId ?? ''}
            onChange={e => setSelectedStaffId(e.target.value || null)}
            className="py-1.5 px-2 text-xs text-text-primary border border-border rounded-lg bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[90px]"
          >
            <option value="">담당자 전체</option>
            {staffList.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* 목록 */}
        <div className="bg-surface rounded-xl border border-border overflow-auto flex-1">
          {loading ? (
            <div className="py-20 text-center text-text-tertiary text-sm">불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center text-text-tertiary text-sm">{search ? `"${search}" 검색 결과 없음` : '고객이 없습니다.'}</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken border-b border-border sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every(c => checkedIds.includes(c.id))}
                      onChange={e => setCheckedIds(e.target.checked ? filtered.map(c => c.id) : [])}
                      className="accent-blue-600 cursor-pointer"
                    />
                  </th>
                  {([
                    { key: 'business_name', label: '업체명 / 연락처' },
                    { key: 'service',       label: '서비스' },
                    ...(!isWorker ? [{ key: null, label: '결제/청구' } as const] : []),
                    { key: null,            label: '성향' },
                    ...(!isWorker ? [{ key: 'contract' as const, label: '계약기간' }] : []),
                    { key: 'interval',      label: '방문주기' },
                    { key: 'next_visit',    label: '방문일정' },
                  ] as const).map(col => (
                    <th
                      key={col.label}
                      onClick={col.key ? () => toggleSort(col.key!) : undefined}
                      className={`text-left px-3 py-3 text-xs font-semibold text-text-secondary whitespace-nowrap select-none ${col.key ? 'cursor-pointer hover:text-text-primary' : ''}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {col.key && (
                          <span className="text-[10px] text-text-tertiary">
                            {sortKey === col.key ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                          </span>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {filtered.map(c => {
                  const rawType = c.customer_type ?? '1회성케어'
                  const type: CustomerType = (rawType in TYPE_STYLE ? rawType : '1회성케어') as CustomerType
                  const tStyle = TYPE_STYLE[type] ?? TYPE_STYLE['1회성케어']
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
                      className={`hover:bg-brand-50 transition-colors cursor-pointer ${isSelected ? 'bg-brand-50 border-l-2 border-brand-600' : ''} ${isChecked ? 'bg-brand-50' : ''}`}
                      onClick={() => handleSelect(c)}>
                      <td className="px-3 py-3" onClick={e => { e.stopPropagation(); toggleCheck(c.id) }}>
                        <input type="checkbox" checked={isChecked} readOnly className="accent-blue-600 pointer-events-none cursor-pointer" />
                      </td>
                      <td className="px-3 py-3 min-w-[160px]">
                        <p className="text-sm font-semibold text-text-primary">{c.business_name}</p>
                        <p className="text-xs text-text-secondary mt-0.5">{c.contact_name} · {c.contact_phone}</p>
                        {(c.billing_next_date || c.next_visit_date) && (
                          <p className="text-xs text-text-tertiary mt-0.5">
                            {c.billing_next_date && `결제 ${fmtDate(c.billing_next_date)}`}
                            {c.billing_next_date && c.next_visit_date && '  '}
                            {c.next_visit_date && `방문 ${fmtDate(c.next_visit_date)}`}
                          </p>
                        )}
                        <StatusBadges customer={c} hideContract={isWorker} />
                        <div className="flex gap-1 mt-1">
                          {c.user_id != null
                            ? <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">계정생성완료</span>
                            : <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full font-medium">계정없음</span>
                          }
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${tStyle.badge}`}>{type}</span>
                      </td>
                      {/* 결제/청구 셀 (관리자 전용) — 결제방법 + 최근 청구·계산서 뱃지 */}
                      {!isWorker && (
                        <td className="px-3 py-3 whitespace-nowrap min-w-[180px]">
                          {c.payment_method && (
                            <p className="text-[11px] text-text-secondary mb-1">{c.payment_method}</p>
                          )}
                          {(c.customer_type === '정기딥케어' || c.customer_type === '정기엔드케어') && (() => {
                            const b = latestBillings[c.id]
                            if (!b) {
                              return (
                                <span className="text-xs px-1.5 py-0.5 bg-surface-sunken text-text-tertiary rounded-full font-medium border border-border">
                                  {c.billing_cycle === '연간' ? `${new Date().getFullYear()} 청구 없음` : '이번달 청구 없음'}
                                </span>
                              )
                            }
                            return (
                              <div className="flex gap-1 flex-wrap items-center">
                                <span className="text-[10px] text-text-tertiary">
                                  {b.billing_type === 'annual' ? `${b.billing_period}년` : b.billing_period}
                                </span>
                                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                                  b.status === 'paid'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : b.status === 'overdue'
                                      ? 'bg-red-100 text-red-700'
                                      : 'bg-yellow-100 text-yellow-700'
                                }`}>
                                  {b.status === 'paid' ? '결제완료' : b.status === 'overdue' ? '연체' : '미결제'}
                                </span>
                                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                                  b.tax_invoice_issued
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-surface-sunken text-text-tertiary border border-border'
                                }`}>
                                  {b.tax_invoice_issued ? '계산서완료' : '계산서 미발행'}
                                </span>
                              </div>
                            )
                          })()}
                        </td>
                      )}
                      <td className="px-3 py-3 whitespace-nowrap">
                        {(() => {
                          const d = (c.disposition ?? '보통') as CustomerDisposition
                          return <span className={`text-xs px-1.5 py-0.5 rounded-full ${DISPOSITION_STYLE[d].badge}`}>{d}</span>
                        })()}
                      </td>
                      {!isWorker && (
                      <td className="px-3 py-3 text-xs text-text-secondary whitespace-nowrap">
                        {(c.contract_start_date || c.contract_end_date)
                          ? <>{fmtDate(c.contract_start_date)} ~ {fmtDate(c.contract_end_date)}</>
                          : <span className="text-text-tertiary">-</span>}
                      </td>
                      )}
                      <td className="px-3 py-3 text-xs text-text-secondary whitespace-nowrap">
                        {visitIntervalText || <span className="text-text-tertiary">-</span>}
                      </td>
                      <td className="px-3 py-3 text-xs text-text-secondary whitespace-nowrap">
                        {visitScheduleText || <span className="text-text-tertiary">-</span>}
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
        <div className="fixed inset-x-0 top-0 bottom-0 z-[60] md:absolute md:inset-x-auto md:right-0 md:top-0 md:bottom-0 md:w-[480px] bg-surface md:rounded-xl md:border md:border-border shadow-2xl overflow-y-auto">

          {/* 헤더 */}
          <div className="p-4 border-b border-border-subtle flex items-center justify-between sticky top-0 bg-surface z-10">
            <h2 className="font-bold text-text-primary break-words">{isNew ? '새 고객 추가' : selected?.business_name}</h2>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={closeDetail} className="text-text-tertiary hover:text-text-secondary text-lg leading-none">✕</button>
            </div>
          </div>

          <div className="p-4 pb-24 md:pb-8 space-y-5">
            {/* 고객 유형 + 상태 */}
            <div>
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">고객 유형</p>
              <div className="flex gap-1.5 flex-wrap mb-2">
                {CUSTOMER_TYPES.map(t => (
                  <button key={t} onClick={() => set('customer_type')(t)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      form.customer_type === t
                        ? `${TYPE_STYLE[t].badge} ring-2 ring-offset-1 ring-current`
                        : 'bg-surface-sunken text-text-secondary hover:bg-surface-sunken'
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
                        : 'bg-surface-sunken text-text-secondary hover:bg-surface-sunken'
                    }`}>{STATUS_STYLE[s].label}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5 mt-2">
                {(['호의', '보통', '주의'] as CustomerDisposition[]).map(d => (
                  <button key={d} onClick={() => set('disposition')(d)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      (form.disposition ?? '보통') === d
                        ? `${DISPOSITION_STYLE[d].badge} ring-2 ring-offset-1 ring-current`
                        : 'bg-surface-sunken text-text-secondary hover:bg-surface-sunken'
                    }`}>{d}
                  </button>
                ))}
              </div>
              {/* 고객 등급 */}
              <div className="flex gap-1.5 mt-2">
                <span className="text-xs text-text-tertiary self-center w-8 shrink-0">등급</span>
                {(['화이트', '블루', '블랙'] as CustomerGrade[]).map(g => (
                  <button key={g} onClick={() => setForm(f => ({ ...f, grade: f.grade === g ? '' : g }))}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      form.grade === g
                        ? `${GRADE_STYLE[g].badge} ring-2 ring-offset-1 ring-current`
                        : 'bg-surface-sunken text-text-secondary hover:bg-surface-sunken'
                    }`}>{g}
                  </button>
                ))}
              </div>
            </div>

            {/* 담당직원 */}
            <div className="bg-surface-sunken rounded-xl p-4 flex flex-col gap-3">
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">담당직원</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-secondary w-24 shrink-0">담당자</span>
                <select value={form.assigned_user_id} onChange={e => set('assigned_user_id')(e.target.value)}
                  className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface">
                  <option value="">담당자 없음</option>
                  {usersList.filter(u => u.role === 'admin' || u.role === 'worker').map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.role === 'admin' ? '관리자' : '직원'})</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-secondary w-24 shrink-0">작업자</span>
                <select value={form.assigned_worker_id} onChange={e => set('assigned_worker_id')(e.target.value)}
                  className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface">
                  <option value="">작업자 없음</option>
                  {workersList.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 일반정보 */}
            <div>
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">일반정보</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary w-20 shrink-0">고객명</span>
                  <input value={form.contact_name} onChange={e => set('contact_name')(e.target.value)}
                    className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary w-20 shrink-0">업체명</span>
                  <input value={form.business_name} onChange={e => set('business_name')(e.target.value)}
                    className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary w-20 shrink-0">연락처</span>
                  <div className="flex flex-1 gap-1">
                    <input value={form.contact_phone} onChange={e => set('contact_phone')(e.target.value)}
                      className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <a href={`tel:${form.contact_phone}`} className="px-2 py-1.5 text-xs bg-brand-50 text-brand-600 rounded-lg hover:bg-brand-100"><Phone size={14} /></a>
                    <button onClick={() => navigator.clipboard.writeText(form.contact_phone).then(() => toast.success('연락처 복사됨'))} className="px-2 py-1.5 text-xs bg-surface-sunken rounded-lg hover:bg-surface-sunken"><ClipboardList size={14} /></button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary w-20 shrink-0">추가번호</span>
                  <div className="flex flex-1 gap-1">
                    <input value={form.contact_phone_2} onChange={e => set('contact_phone_2')(e.target.value)}
                      placeholder="알림수신 추가번호 (선택)"
                      className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    {form.contact_phone_2 && (
                      <a href={`tel:${form.contact_phone_2}`} className="px-2 py-1.5 text-xs bg-brand-50 text-brand-600 rounded-lg hover:bg-brand-100"><Phone size={14} /></a>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary w-20 shrink-0">포털 계정</span>
                  <div className="flex-1 flex items-center gap-1.5">
                    {selected?.user_id != null
                      ? <><span className="w-2 h-2 rounded-full bg-green-500 shrink-0" /><span className="text-xs text-green-700 font-medium">생성완료</span></>
                      : <><span className="w-2 h-2 rounded-full bg-gray-400 shrink-0" /><span className="text-xs text-gray-500 font-medium">미생성</span></>
                    }
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary w-20 shrink-0">이메일</span>
                  <input value={form.email} onChange={e => set('email')(e.target.value)}
                    className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary w-20 shrink-0">주소</span>
                  <div className="flex flex-1 gap-1">
                    <input value={form.address} onChange={e => set('address')(e.target.value)}
                      className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <button onClick={() => setMapAddress(form.address)}
                      className="px-2 py-1.5 text-xs bg-green-50 text-green-700 rounded-lg hover:bg-green-100 shrink-0"><Map size={14} /></button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary w-20 shrink-0">영업시간</span>
                  <div className="flex items-center gap-1 flex-1">
                    <input type="time" value={form.business_hours_start} onChange={e => set('business_hours_start')(e.target.value)}
                      className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <span className="text-text-tertiary text-xs">~</span>
                    <input type="time" value={form.business_hours_end} onChange={e => set('business_hours_end')(e.target.value)}
                      className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              </div>
            </div>

            {/* 작업장정보 */}
            <div>
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">작업장정보</p>
              <div className="border-2 border-green-200 rounded-xl p-3 space-y-2 bg-green-50/30">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary w-20 shrink-0">주차</span>
                  <input value={form.parking_info} onChange={e => set('parking_info')(e.target.value)}
                    className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary w-20 shrink-0">건물출입</span>
                  <input value={form.building_access} onChange={e => set('building_access')(e.target.value)}
                    className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary w-20 shrink-0">엘리베이터</span>
                  <input value={form.elevator} onChange={e => set('elevator')(e.target.value)}
                    className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary w-20 shrink-0">출입방법</span>
                  <input value={form.access_method} onChange={e => set('access_method')(e.target.value)}
                    className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </div>

            {/* 시공정보 */}
            <div>
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">시공정보</p>
              <div className="border-2 border-green-200 rounded-xl p-3 space-y-2 bg-green-50/30">
                <div className="flex items-start gap-2">
                  <span className="text-xs text-text-secondary w-20 shrink-0 pt-1.5">케어범위</span>
                  <textarea value={form.care_scope} onChange={e => set('care_scope')(e.target.value)} rows={3}
                    placeholder="예) - 후드청소&#10;- 덕트청소&#10;- 계단청소"
                    className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 resize-none text-text-primary" />
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-xs text-text-secondary w-20 shrink-0 pt-1.5">고객 요청사항</span>
                  <textarea value={form.special_notes} onChange={e => set('special_notes')(e.target.value)} rows={2}
                    className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 resize-none text-text-primary" />
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-xs text-text-secondary w-20 shrink-0 pt-1.5">관리자 요청사항</span>
                  <textarea value={form.admin_notes ?? ''} onChange={e => set('admin_notes')(e.target.value)} rows={2}
                    className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 resize-none text-text-primary" />
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-xs text-text-secondary w-20 shrink-0 pt-1.5">관리자메모</span>
                  <textarea value={form.notes} onChange={e => set('notes')(e.target.value)} rows={3}
                    placeholder="내부 메모를 입력하세요..."
                    className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 resize-none text-text-primary" />
                </div>
                {/* 케어매뉴얼 (정기 고객) — 관리자: 편집 / 직원: 보기 */}
                {!isNew && selected && isRegular && (
                  <div className="pt-1">
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-green-300 bg-green-50 hover:bg-green-100 transition-colors text-sm font-medium text-green-800"
                      onClick={() => { window.location.href = `/admin/customers/${selected.id}/care-manual` }}
                    >
                      <BookOpen size={15} className="text-green-700 shrink-0" />
                      {isWorker ? '케어매뉴얼 보기' : '케어매뉴얼 편집'}
                    </button>
                  </div>
                )}
                {/* 계정 통합 (같은 사업장이 정기딥/정기엔드 동시 이용 시) — 관리자 전용 */}
                {!isNew && selected && isRegular && !isWorker && (
                  <div className="pt-1">
                    <CustomerAccountLink
                      customerId={selected.id}
                      accountUserId={selected.account_user_id}
                      linkedLabel={(() => {
                        if (!selected.account_user_id) return null
                        const target = customers.find(c => c.user_id === selected.account_user_id)
                        if (!target) return null
                        return target.customer_type
                          ? `${target.business_name} (${target.customer_type})`
                          : target.business_name
                      })()}
                      onUpdated={(next) => setSelected(prev => prev ? { ...prev, account_user_id: next } : prev)}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* 결제정보 — worker 숨김 */}
            {!isWorker && (
            <div>
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">결제정보</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary w-20 shrink-0">결제방법</span>
                  <select value={form.payment_method} onChange={e => set('payment_method')(e.target.value)}
                    className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface">
                    <option value="">선택...</option>
                    <option value="현금(계산서 희망)">현금(계산서 희망)</option>
                    <option value="현금(비과세)">현금(비과세)</option>
                    <option value="카드(온라인 간편결제)">카드(온라인 간편결제)</option>
                    <option value="플랫폼">플랫폼</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary w-20 shrink-0">계좌번호</span>
                  <div className="flex flex-1 gap-1">
                    <input value={form.account_number} onChange={e => set('account_number')(e.target.value)}
                      className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
                    <button onClick={() => navigator.clipboard.writeText(form.account_number).then(() => toast.success('계좌번호 복사됨'))} className="px-2 py-1.5 text-xs bg-surface-sunken rounded-lg hover:bg-surface-sunken"><ClipboardList size={14} /></button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary w-20 shrink-0">사업자번호</span>
                  <div className="flex flex-1 gap-1">
                    <input value={form.business_number} onChange={e => set('business_number')(e.target.value)}
                      className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
                    <button onClick={() => navigator.clipboard.writeText(form.business_number).then(() => toast.success('사업자번호 복사됨'))} className="px-2 py-1.5 text-xs bg-surface-sunken rounded-lg hover:bg-surface-sunken"><ClipboardList size={14} /></button>
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* ── 1회성케어 금액정보 — worker 숨김 ── */}
            {!isWorker && isOnceCare && (
              <div className="rounded-xl border border-green-200 overflow-hidden">
                <div className="bg-green-50 px-4 py-2.5 border-b border-green-200">
                  <p className="text-xs font-semibold text-green-800">금액정보</p>
                </div>
                <div className="p-4 flex flex-col gap-3">
                  {isNoVatMethod(form.payment_method) && (
                    <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-xs text-amber-700 font-semibold flex items-center gap-1"><Banknote size={14} /> 현금 결제 — 부가세 미적용</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-text-secondary mb-0.5 block">공급가액</label>
                      <input type="number" value={form.supply_amount} onChange={e => set('supply_amount')(e.target.value)}
                        placeholder="0"
                        className="w-full border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-400 text-text-primary" />
                    </div>
                    <div>
                      <label className="text-xs text-text-secondary mb-0.5 block">
                        부가세 {isNoVatMethod(form.payment_method) ? <span className="text-text-tertiary">(비적용)</span> : <span className="text-text-tertiary">(자동 10%)</span>}
                      </label>
                      <input type="number"
                        value={isNoVatMethod(form.payment_method) ? '0' : form.vat}
                        onChange={e => set('vat')(e.target.value)}
                        disabled={isNoVatMethod(form.payment_method)}
                        placeholder="0"
                        className="w-full border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-400 text-text-primary disabled:bg-surface-sunken disabled:text-text-tertiary" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-text-secondary mb-0.5 block">예약금</label>
                      <input type="number" value={form.deposit} onChange={e => set('deposit')(e.target.value)}
                        placeholder="0"
                        className="w-full border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-400 text-text-primary" />
                    </div>
                    <div>
                      <label className="text-xs text-text-secondary mb-0.5 block">잔금 <span className="text-text-tertiary">(자동계산)</span></label>
                      <input type="number" value={form.balance} readOnly
                        placeholder="0"
                        className="w-full border border-border rounded-lg px-2 py-1.5 text-xs bg-surface-sunken text-text-secondary cursor-default" />
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-xs pt-1 border-t border-border-subtle">
                    <span className="text-text-secondary">총액 (공급가액 + 부가세)</span>
                    <span className="font-bold text-text-primary">
                      {((Number(form.supply_amount) || 0) + (isNoVatMethod(form.payment_method) ? 0 : (Number(form.vat) || 0))).toLocaleString('ko-KR')}원
                    </span>
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
                  <div className="bg-surface border border-purple-100 rounded-lg p-3 flex flex-col gap-3">
                    <p className="text-xs font-semibold text-text-primary">고객 → 범빌드코리아</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-secondary w-24 shrink-0">결제 주기</span>
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
                        <p className="text-xs text-amber-700 font-semibold flex items-center gap-1"><Banknote size={14} /> 현금 결제 — 부가세 미적용</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-text-secondary mb-0.5 block">
                          공급가액 <span className="text-text-tertiary">({form.billing_cycle === '연간' ? '연간' : '월간'})</span>
                        </label>
                        <input type="number" value={form.supply_amount} onChange={e => set('supply_amount')(e.target.value)}
                          placeholder="0"
                          className="w-full border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 text-text-primary" />
                      </div>
                      <div>
                        <label className="text-xs text-text-secondary mb-0.5 block">
                          부가세 {isNoVatMethod(form.payment_method) ? <span className="text-text-tertiary">(비적용)</span> : <span className="text-text-tertiary">(자동 10%)</span>}
                        </label>
                        <input type="number"
                          value={isNoVatMethod(form.payment_method) ? '0' : form.vat}
                          onChange={e => set('vat')(e.target.value)}
                          disabled={isNoVatMethod(form.payment_method)}
                          placeholder="0"
                          className="w-full border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 text-text-primary disabled:bg-surface-sunken disabled:text-text-tertiary" />
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-xs pt-1 border-t border-border-subtle">
                      <span className="text-text-secondary">총액 (공급가액 + 부가세)</span>
                      <span className="font-bold text-text-primary">
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
                    <p className="text-xs font-semibold text-text-primary">계약기간</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-secondary w-24 shrink-0">계약 시작</span>
                      <input type="date" value={form.contract_start_date} onChange={e => set('contract_start_date')(e.target.value)}
                        className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 bg-surface text-text-primary" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-secondary w-24 shrink-0">계약 만료</span>
                      <input type="date" value={form.contract_end_date} onChange={e => set('contract_end_date')(e.target.value)}
                        className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 bg-surface text-text-primary" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-secondary w-24 shrink-0">결제일자</span>
                      <input type="number" min={1} max={31} value={form.payment_date}
                        onChange={e => set('payment_date')(e.target.value)}
                        placeholder="1~31"
                        className="w-20 border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 text-center text-text-primary" />
                      <span className="text-xs text-text-tertiary">일</span>
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
                  <div className="bg-surface border border-brand-100 rounded-lg p-3 flex flex-col gap-3">
                    <p className="text-xs font-semibold text-text-primary">고객 → 범빌드코리아</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-secondary w-24 shrink-0">결제 주기</span>
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
                        <p className="text-xs text-amber-700 font-semibold flex items-center gap-1"><Banknote size={14} /> 현금 결제 — 부가세 미적용</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-text-secondary mb-0.5 block">
                          공급가액 <span className="text-text-tertiary">({form.billing_cycle === '연간' ? '연간' : '월간'})</span>
                        </label>
                        <input type="number" value={form.supply_amount} onChange={e => set('supply_amount')(e.target.value)}
                          placeholder="0"
                          className="w-full border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 text-text-primary" />
                      </div>
                      <div>
                        <label className="text-xs text-text-secondary mb-0.5 block">
                          부가세 {isNoVatMethod(form.payment_method) ? <span className="text-text-tertiary">(비적용)</span> : <span className="text-text-tertiary">(자동 10%)</span>}
                        </label>
                        <input type="number"
                          value={isNoVatMethod(form.payment_method) ? '0' : form.vat}
                          onChange={e => set('vat')(e.target.value)}
                          disabled={isNoVatMethod(form.payment_method)}
                          placeholder="0"
                          className="w-full border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 text-text-primary disabled:bg-surface-sunken disabled:text-text-tertiary" />
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-xs pt-1 border-t border-border-subtle">
                      <span className="text-text-secondary">총액 (공급가액 + 부가세)</span>
                      <span className="font-bold text-text-primary">
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
                  <div className="bg-surface border border-brand-100 rounded-lg p-3 flex flex-col gap-3">
                    <p className="text-xs font-semibold text-text-primary">방문 주기 설정</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-secondary w-24 shrink-0">순환식</span>
                      <div className="flex items-center gap-1.5 flex-1">
                        <input
                          type="text"
                          value={form.rotation_type}
                          onChange={e => set('rotation_type')(e.target.value)}
                          placeholder="예: 3개월, 6개월"
                          className="w-28 border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-secondary w-24 shrink-0">월 회수</span>
                      <input type="number" min={1} max={31} value={form.visit_count_per_month}
                        onChange={e => set('visit_count_per_month')(e.target.value)}
                        placeholder="0"
                        className="w-20 border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-center" />
                      <span className="text-xs text-text-tertiary">회/월</span>
                    </div>
                  </div>

                  {/* 계약기간 */}
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold text-text-primary">계약기간</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-secondary w-24 shrink-0">계약 시작</span>
                      <input type="date" value={form.contract_start_date} onChange={e => set('contract_start_date')(e.target.value)}
                        className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-secondary w-24 shrink-0">계약 만료</span>
                      <input type="date" value={form.contract_end_date} onChange={e => set('contract_end_date')(e.target.value)}
                        className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface" />
                    </div>
                  </div>

                  {/* 방문 주기 */}
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold text-text-primary">방문 일정</p>
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
              <div className="bg-surface-sunken rounded-xl p-3 space-y-1.5">
                {form.billing_next_date && (() => {
                  const days = daysUntil(form.billing_next_date)
                  return (
                    <div className="flex justify-between text-xs">
                      <span className="text-text-secondary">다음 결제까지</span>
                      <span className={`font-semibold ${days != null && days < 0 ? 'text-state-danger' : days != null && days <= 7 ? 'text-orange-600' : 'text-text-primary'}`}>
                        {days == null ? '-' : days < 0 ? `${Math.abs(days)}일 지남` : `${days}일 후 (${fmtDate(form.billing_next_date)})`}
                      </span>
                    </div>
                  )
                })()}
                {form.contract_end_date && (() => {
                  const days = daysUntil(form.contract_end_date)
                  return (
                    <div className="flex justify-between text-xs">
                      <span className="text-text-secondary">계약 만료까지</span>
                      <span className={`font-semibold ${days != null && days < 0 ? 'text-state-danger' : days != null && days <= 30 ? 'text-yellow-600' : 'text-text-primary'}`}>
                        {days == null ? '-' : days < 0 ? '계약 만료됨' : `${days}일 후 (${fmtDate(form.contract_end_date)})`}
                      </span>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* 저장 버튼 — worker는 읽기 전용 */}
            {!isWorker && (
              <Button onClick={handleSave} disabled={saving} size="lg" className="w-full">
                {saving ? '저장 중...' : isNew ? '✚ 고객 추가' : <><Save size={14} /> 저장</>}
              </Button>
            )}
            {isWorker && (
              <div className="w-full py-2.5 bg-surface-sunken text-text-secondary text-sm font-semibold rounded-lg text-center">
                읽기 전용 (수정 권한 없음)
              </div>
            )}


            {/* 청구 요약 (관리자 전용) — 최근 결제·계산서 상태 미리보기 */}
            {!isWorker && !isNew && selected && (
              (form.customer_type === '정기딥케어' && form.billing_cycle === '연간') ||
              form.customer_type === '정기엔드케어'
            ) && (
              <BillingSummary
                customerId={selected.id}
                customerType={form.customer_type}
                billingCycle={form.billing_cycle}
                paymentMethod={form.payment_method || null}
                refreshKey={billingRefreshKey}
              />
            )}

            {/* 청구 이력 (정기딥케어 연간 / 정기엔드케어) — worker 숨김 */}
            {!isWorker && !isNew && selected && (
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
                onChange={refetchLatestBillings}
              />
            )}

            {/* 알림 발송 (정기케어만, 관리자만) */}
            {!isWorker && !isNew && selected && isRegular && (
              <div className="border border-border-subtle rounded-xl overflow-hidden">
                <p className="text-xs font-semibold text-text-secondary px-4 py-2.5 bg-surface-sunken border-b border-border-subtle">고객 알림 발송</p>
                <div className="p-4 space-y-3">
                  <div className="flex gap-2">
                    <select value={notifyType} onChange={e => setNotifyType(e.target.value)}
                      className="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-surface">
                      <option value="">알림 유형 선택...</option>
                      {notifyOptions.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <Button onClick={handleNotify} disabled={sending || !notifyType} className="bg-orange-500 hover:bg-orange-600 text-white whitespace-nowrap">
                      {sending ? '발송 중...' : <><Megaphone size={14} /> 발송</>}
                    </Button>
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

    {/* 서비스 일정 생성 모달 */}
    {scheduleGenModal.open && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !scheduleGenModal.submitting && setScheduleGenModal((s) => ({ ...s, open: false }))}>
        <div className="bg-surface rounded-2xl shadow-modal max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
          <h2 className="text-lg font-bold text-text-primary mb-1">서비스 일정 생성</h2>
          <p className="text-xs text-text-tertiary mb-4 break-keep">
            선택한 {checkedIds.length}개 고객의 방문 일정을 아래 날짜부터 자동 생성합니다.
          </p>

          <div className="grid grid-cols-3 gap-2 mb-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-text-secondary">연도</span>
              <select
                value={scheduleGenModal.year}
                onChange={(e) => setScheduleGenModal((s) => ({ ...s, year: Number(e.target.value) }))}
                className="px-3 py-2 border border-border rounded-md text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                {[0, 1, 2].map((offset) => {
                  const y = new Date().getFullYear() + offset
                  return <option key={y} value={y}>{y}년</option>
                })}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-text-secondary">월</span>
              <select
                value={scheduleGenModal.month}
                onChange={(e) => setScheduleGenModal((s) => ({ ...s, month: Number(e.target.value) }))}
                className="px-3 py-2 border border-border rounded-md text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>{m}월</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-text-secondary">시작일</span>
              <select
                value={scheduleGenModal.startDay}
                onChange={(e) => setScheduleGenModal((s) => ({ ...s, startDay: Number(e.target.value) }))}
                className="px-3 py-2 border border-border rounded-md text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>{d}일</option>
                ))}
              </select>
            </label>
          </div>

          <p className="text-[11px] text-text-tertiary bg-surface-sunken rounded-md px-3 py-2 mb-4 break-keep">
            💡 <strong>{scheduleGenModal.year}년 {scheduleGenModal.month}월 {scheduleGenModal.startDay}일</strong> 이후 방문 주기(요일/월간 날짜) 패턴대로 일정이 생성됩니다.
          </p>

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setScheduleGenModal((s) => ({ ...s, open: false }))}
              disabled={scheduleGenModal.submitting}
              className="px-4 py-2 text-sm font-semibold text-text-secondary hover:bg-surface-sunken rounded-lg disabled:opacity-50"
            >
              취소
            </button>
            <button
              onClick={() => handleGenerateSchedulesBulk(scheduleGenModal.year, scheduleGenModal.month, scheduleGenModal.startDay)}
              disabled={scheduleGenModal.submitting}
              className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50"
            >
              {scheduleGenModal.submitting ? '생성 중...' : '진행'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
