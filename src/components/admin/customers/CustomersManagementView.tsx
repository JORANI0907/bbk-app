'use client'

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { useModalBackButton } from '@/hooks/useModalBackButton'
import { MapSelectorModal } from '@/components/MapSelectorModal'
import { BillingHistoryPanel } from '@/components/admin/BillingHistoryPanel'
import { Button } from '@/components/ui'
import { Phone, ClipboardList, Map, Banknote, Save, Megaphone, Calendar, BookOpen, Archive, Trash2, Copy } from 'lucide-react'
import { CustomerAccountLink } from '@/components/admin/CustomerAccountLink'
import { FieldHint } from '@/components/ui/FieldHint'
import { MonthlyScheduleSection } from '@/components/admin/customers/MonthlyScheduleSection'
import { PaymentIssuesSummary } from '@/components/admin/customers/PaymentIssuesSummary'
import { ServiceManagementPage } from '@/components/admin/applications/ServiceManagementView'
import { CustomersCalendarGrid, type CalendarApp } from '@/components/admin/customers/CustomersCalendarGrid'
import { computeAppAmount, fmtAmount } from '@/components/admin/customers/calendar-amount'
import { TODAY_ROW_BORDER, TODAY_ROW_BG, TODAY_ROW_SHADOW } from '@/lib/ui/today-styles'

// ─── 타입 ─────────────────────────────────────────────────────
type CustomerType = '1회성케어' | '정기딥케어' | '정기엔드케어' | '정기딥케어샘플' | '정기엔드케어샘플' | '일반일정'
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
  // Phase 9-A: 진행/결제 상태 이원화 (1회성 세부화면 전용, 정기는 null)
  progress_status: string | null
  payment_status_detail: string | null
  // Phase 20-C / 22: 투입주기 (자유 텍스트, INTEGER→TEXT 확장 — 숫자·격주·매월 등 임의 표현)
  injection_cycle_months: string | null
  // 서비스관리 이관 필드 (Phase A)
  notification_log: Array<{ type: string; sent_at: string; phone?: string; method?: 'auto' | 'manual'; template_id?: string }> | null
  phone_notify_1: boolean | null
  phone_notify_2: boolean | null
  construction_time: string | null
  deposit_payment_url: string | null
  balance_payment_url: string | null
  deposit_portone_id: string | null
  balance_portone_id: string | null
  deposit_paid_at: string | null
  balance_paid_at: string | null
  billing_key: string | null
  created_at: string
  updated_at: string
}

interface NotifyLog { type: string; sentAt: string; method?: 'auto' | 'manual' }

function dbLogToNotifyLog(l: { type: string; sent_at: string; method?: 'auto' | 'manual' }): NotifyLog {
  return { type: l.type, sentAt: l.sent_at, method: l.method ?? 'auto' }
}

// ─── 상수 ─────────────────────────────────────────────────────
// Phase 22: 샘플 유형(정기엔드케어샘플/정기딥케어샘플) 편집 UI 노출 제거. 타입 union은 legacy DB 레코드 렌더링 위해 유지.
const CUSTOMER_TYPES: CustomerType[] = ['정기엔드케어', '정기딥케어', '1회성케어', '일반일정']

// 리스트 상단 필터 옵션 (편집 폼 유형과 별도)
type FilterOption = '정기엔드케어' | '정기딥케어' | '1회성케어' | '일반일정'
const FILTER_OPTIONS: FilterOption[] = ['1회성케어', '정기딥케어', '정기엔드케어', '일반일정']
// Phase 27-J: 필터 버튼 축약 라벨 (상단 UI 간소화)
const FILTER_SHORT_LABEL: Record<FilterOption, string> = {
  '1회성케어': '1회성',
  '정기딥케어': '정기딥',
  '정기엔드케어': '정기엔드',
  '일반일정': '일반',
}

// 필터 옵션 → 실제 customer_type 매칭 판별
function matchesCustomerFilter(customerType: CustomerType, filter: FilterOption): boolean {
  return customerType === filter
}
const PAYMENT_METHODS = ['현금', '카드', '계좌이체', '현금(부가세 X)']
const PAYMENT_STATUS_OPTIONS = ['미수령', '수령완료', '세금계산서발행', '결제완료']
const ELEVATOR_OPTIONS = ['있음', '없음', '해당없음']
const BUILDING_ACCESS_OPTIONS = ['신청필요', '신청불필요', '해당없음']
const PARKING_OPTIONS = ['가능', '불가능', '주차없음']

// Phase A-3: 서비스관리 17종 알림 이관. customer_type별로 노출 대상 필터링.
// Phase 20-B: ScheduleAccordionRow에서도 재사용 위해 export
export const NOTIFY_TYPES: Record<CustomerType, string[]> = {
  '1회성케어': [
    '방문견적알림',
    '예약확정알림', '예약1일전알림', '예약당일알림',
    '예약금 입금완료 알림',
    '작업완료알림', '작업완료알림(현금)', '작업완료알림(카드,플렛폼)',
    '결제알림', '결제알림(현금)', '결제알림(카드,플렛폼)',
    '결제완료알림', '결제완료알림(잔금)',
    '계산서발행완료알림', '예약금환급완료알림',
    '예약취소알림', 'A/S방문알림',
    '계정안내알림',
  ],
  '정기딥케어': [
    '정기결제알림', '정기방문알림', '계약갱신알림', '계정안내알림',
    '예약1일전알림', '예약당일알림',
    '작업완료알림', '결제완료알림', '계산서발행완료알림',
    'A/S방문알림',
  ],
  '정기엔드케어': [
    '정기결제알림', '정기방문알림', '계약갱신알림', '계정안내알림',
    '예약1일전알림', '예약당일알림',
    '작업완료알림(정기엔드케어)', '결제완료알림', '계산서발행완료알림',
    'A/S방문알림',
  ],
  // 샘플 유형 — 영업용이라 실 알림 발송 없음
  '정기엔드케어샘플': [],
  '정기딥케어샘플':   [],
  // Phase 17: 일반일정 — 견적방문·A/S 등 임시 일정. 기본은 알림 없음 (필요 시 관리자 수동)
  '일반일정': [],
}

// 알림 타입별 뱃지 스타일 (발송 이력 표시용)
const NOTIFY_TYPE_CONFIG: Record<string, { badge: string; dot: string }> = {
  '예약확정알림':       { badge: 'bg-brand-100 text-brand-700',    dot: 'bg-brand-500' },
  '예약1일전알림':      { badge: 'bg-sky-100 text-sky-700',        dot: 'bg-sky-400' },
  '예약당일알림':       { badge: 'bg-violet-100 text-violet-700',  dot: 'bg-violet-500' },
  '작업완료알림':               { badge: 'bg-green-100 text-green-700',    dot: 'bg-green-500' },
  '작업완료알림(현금)':         { badge: 'bg-green-100 text-green-800',    dot: 'bg-green-600' },
  '작업완료알림(카드,플렛폼)':  { badge: 'bg-lime-100 text-lime-700',      dot: 'bg-lime-500' },
  '작업완료알림(정기엔드케어)': { badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  '결제알림':               { badge: 'bg-orange-100 text-orange-700',  dot: 'bg-orange-500' },
  '결제알림(현금)':         { badge: 'bg-orange-100 text-orange-800',  dot: 'bg-orange-600' },
  '결제알림(카드,플렛폼)':  { badge: 'bg-amber-100 text-amber-700',    dot: 'bg-amber-500' },
  '결제완료알림':       { badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  '결제완료알림(잔금)': { badge: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-600' },
  '계산서발행완료알림': { badge: 'bg-teal-100 text-teal-700',      dot: 'bg-teal-500' },
  '예약금환급완료알림':  { badge: 'bg-cyan-100 text-cyan-700',      dot: 'bg-cyan-500' },
  '예약금 입금완료 알림': { badge: 'bg-teal-100 text-teal-700',    dot: 'bg-teal-500' },
  '예약취소알림':       { badge: 'bg-red-100 text-red-700',        dot: 'bg-red-500' },
  'A/S방문알림':        { badge: 'bg-yellow-100 text-yellow-700',  dot: 'bg-yellow-500' },
  '방문견적알림':       { badge: 'bg-indigo-100 text-indigo-700',  dot: 'bg-indigo-500' },
  '정기결제알림':       { badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  '정기방문알림':       { badge: 'bg-brand-100 text-brand-700',    dot: 'bg-brand-500' },
  '계약갱신알림':       { badge: 'bg-purple-100 text-purple-700',  dot: 'bg-purple-500' },
  '건당결제알림':       { badge: 'bg-orange-100 text-orange-700',  dot: 'bg-orange-500' },
  '계정안내알림':       { badge: 'bg-fuchsia-100 text-fuchsia-700', dot: 'bg-fuchsia-500' },
}

// 비과세 결제방법 여부 (부가세 0)
const isNoVatMethod = (method: string | null | undefined): boolean =>
  !!method && (method.includes('비과세') || method.includes('미희망') || method === '현금(부가세 X)')

// Phase 22 v13: 케어별 뱃지 색상 확실히 구분 (1회성=green, 정기딥=blue/brand, 정기엔드=purple, 일반=stone)
const TYPE_STYLE: Record<CustomerType, { badge: string; accent: string }> = {
  '1회성케어':    { badge: 'bg-emerald-100 text-emerald-700', accent: 'border-emerald-200 bg-emerald-50' },
  '정기딥케어':   { badge: 'bg-brand-100 text-brand-700',     accent: 'border-brand-200 bg-brand-50' },
  '정기엔드케어': { badge: 'bg-purple-100 text-purple-700', accent: 'border-purple-200 bg-purple-50' },
  // Phase 17: 일반일정 — stone(따뜻한 회색) 톤으로 1회성 slate와 구분
  '일반일정':     { badge: 'bg-stone-100 text-stone-700', accent: 'border-stone-200 bg-stone-50' },
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

// Phase 13: 고객관리 색상 규칙 재조정
// 진행상태 = 좌측 border-l-4 색 (상태축)
const PROGRESS_ROW_BORDER: Record<string, string> = {
  '신청서작성': 'border-l-gray-400',
  '예약확정':   'border-l-blue-500',
  '예약1일전':  'border-l-amber-500',
  '예약당일':   'border-l-orange-500',
  '작업완료':   'border-l-emerald-500',
  '예약취소':   'border-l-red-500',
  'A/S방문':    'border-l-violet-500',
  '방문견적':   'border-l-cyan-500',
}

// 결제상태 = 행 전체 배경 (파스텔톤 · 사용자 지시)
const PAYMENT_ROW_BG: Record<string, string> = {
  '예약금 입금':      'bg-amber-50',
  '결제':             'bg-orange-50',
  '결제완료':         'bg-emerald-50',
  '결제완료(잔금)':   'bg-emerald-100',
  '계산서발행완료':   'bg-blue-50',
  '예약금환급완료':   'bg-gray-100',
  '비과세':           'bg-teal-50',
  '카드결제 완료':    'bg-indigo-50',
}

// 결제상태 = 우측 뱃지 dot 색 (금전축 · 세밀)
const PAYMENT_STATUS_DOT: Record<string, string> = {
  '예약금 입금':      'bg-amber-400',
  '결제':             'bg-orange-500',
  '결제완료':         'bg-emerald-500',
  '결제완료(잔금)':   'bg-emerald-600',
  '계산서발행완료':   'bg-blue-500',
  '예약금환급완료':   'bg-gray-400',
  '비과세':           'bg-teal-500',
  '카드결제 완료':    'bg-indigo-500',
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
  // Phase A-5: 시공시간(1회성) + 전화 발송 체크박스
  construction_time: '',
  phone_notify_1: true,
  phone_notify_2: false,
  // Phase 9-C: 1회성 진행/결제 상태 (신규 등록 시 기본은 시공일자 유무로 자동)
  progress_status: '',
  payment_status_detail: '',
  // Phase 20-C: 투입주기 (몇 개월에 1회)
  injection_cycle_months: '',
}

// Phase 9-C: 1회성 진행상태·결제상태 옵션 (자동화 매핑과 완전 일치)
const PROGRESS_STATUS_OPTIONS = [
  '신청서작성', '예약확정', '예약1일전', '예약당일',
  '작업완료', '예약취소', 'A/S방문', '방문견적',
] as const

const PAYMENT_STATUS_DETAIL_OPTIONS = [
  { value: '예약금 입금',    label: '예약금 입금' },
  { value: '결제',           label: '결제' },
  { value: '결제완료',       label: '결제완료' },
  { value: '결제완료(잔금)', label: '결제완료(잔금)' },
  { value: '계산서발행완료', label: '계산서발행완료' },
  { value: '예약금환급완료', label: '예약금환급완료' },
  { value: '비과세',         label: '비과세 결제' }, // DB값은 '비과세' 유지
  { value: '카드결제 완료',  label: '카드결제 완료' },
] as const

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

// ─── 메인 컴포넌트 ────────────────────────────────────────────

/**
 * Phase 3-G: 이 뷰는 페이지 진입점(/admin/customers)에서도, 다른 페이지(고객DB이력 등)에서도 embed 형태로 재사용된다.
 * - forceCustomerType: 특정 고객 유형만 표시하고 유형 필터 UI 숨김
 * - embedded: 페이지 헤더 등 최소화 (기본 false)
 */
export interface CustomersManagementViewProps {
  embedded?: boolean
  forceCustomerType?: '1회성케어' | '정기딥케어' | '정기엔드케어' | null
  /** Phase 4: 이력 모드 — archived 데이터만 표시 + 이관 취소 버튼 */
  archivedView?: boolean
}

export function CustomersManagementView({
  embedded = false,
  forceCustomerType = null,
  archivedView = false,
}: CustomersManagementViewProps = {}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [customers, setCustomers] = useState<Customer[]>([])
  // Phase 7-D / Phase 14: 신청서 폼 유입 — 전체 필드 수용 (세부화면 완전 매핑용)
  const [pendingApplications, setPendingApplications] = useState<Array<{
    id: string
    business_name: string | null
    owner_name: string | null
    phone: string | null
    phone_2: string | null
    email: string | null
    address: string | null
    business_number: string | null
    account_number: string | null
    platform_nickname: string | null
    business_hours_start: string | null
    business_hours_end: string | null
    elevator: string | null
    building_access: string | null
    access_method: string | null
    parking: string | null
    payment_method: string | null
    service_type: string | null
    construction_date: string | null
    construction_time: string | null
    care_scope: string | null
    request_notes: string | null
    admin_request_notes: string | null
    admin_notes: string | null
    supply_amount: number | null
    vat: number | null
    deposit: number | null
    balance: number | null
    unit_price_per_visit: number | null
    assigned_to: string | null
    customer_id: string | null
    status: string | null
    created_at: string
  }>>([])
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
  // Phase 22: 정기딥케어 연간 계약정보 섹션 내 결제 이력 인라인 토글
  const [showInlineAnnualHistory, setShowInlineAnnualHistory] = useState(false)
  // Phase 22 v9: 정기엔드케어 계약정보 섹션 내 결제 이력 인라인 토글 (월간/연간 모두)
  const [showInlineEndCareHistory, setShowInlineEndCareHistory] = useState(false)
  // Phase 7-F: 1회성 embed(ServiceManagementView)에 새로고침 트리거 전달용 카운터
  const [embedRefetchKey, setEmbedRefetchKey] = useState(0)
  const [loading, setLoading] = useState(true)
  // Phase 6-B: 진입 시 유형은 전체(빈 Set), 미배정 필터 활성 (forceCustomerType 있을 땐 그것으로 강제)
  const [selectedTypes, setSelectedTypes] = useState<Set<FilterOption>>(
    () => forceCustomerType
      ? new Set([forceCustomerType as FilterOption])
      : new Set()
  )
  const [showUnassignedOnly, setShowUnassignedOnly] = useState<boolean>(
    () => !forceCustomerType && !archivedView
  )
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Customer | null>(null)
  const [isNew, setIsNew] = useState(false)
  // Phase 27: 뷰 모드 (리스트/캘린더) + 캘린더에서 선택된 회차 focus
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [calendarFocus, setCalendarFocus] = useState<{ appId: string; month: string } | null>(null)
  // Phase 27-E: 이번주·이번달 매출 요약 + 주별 breakdown (리스트/캘린더 무관하게 상단 배지)
  interface WeekBreakdown { label: string; amount: number; isCurrent: boolean; startIso: string; endIso: string }
  const [revenueSummary, setRevenueSummary] = useState<{ week: number; month: number; weeks: WeekBreakdown[] }>({ week: 0, month: 0, weeks: [] })
  const [form, setForm] = useState<typeof EMPTY_FORM>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [notifyType, setNotifyType] = useState('')
  const [sending, setSending] = useState(false)
  const [notifyLogs, setNotifyLogs] = useState<NotifyLog[]>([])
  // Phase A-4: 포트원 결제 링크 생성/청구 로딩 상태
  const [sendingPaymentLink, setSendingPaymentLink] = useState(false)
  const [chargingBalance, setChargingBalance] = useState(false)
  const [checkedIds, setCheckedIds] = useState<string[]>([])
  const [bulkCreating, setBulkCreating] = useState(false)
  // Phase 5-E: 기간 기반 모달 — mode(create=신규 생성 / cleanup=수정)
  const [scheduleGenModal, setScheduleGenModal] = useState<{
    open: boolean
    mode: 'create' | 'cleanup'
    startDate: string
    endDate: string
    submitting: boolean
  }>({ open: false, mode: 'create', startDate: '', endDate: '', submitting: false })
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
  const [usersList, setUsersList] = useState<Array<{ id: string; name: string; role: string; phone: string | null }>>([])
  const [workersList, setWorkersList] = useState<Array<{ id: string; name: string; employment_type?: string | null }>>([])

  // 직원 필터 (정직원만)
  const [staffList, setStaffList] = useState<Array<{ id: string; name: string; user_id: string | null }>>([])
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null)

  // 지도 앱 선택 모달
  const [mapAddress, setMapAddress] = useState<string | null>(null)

  // 세부화면 닫기
  const closeDetail = useCallback(() => { setSelected(null); setIsNew(false); setCalendarFocus(null) }, [])

  // Phase 27: handleCalendarSelect는 handleSelect(리스트 클릭 로직) 정의 이후로 이동됨.
  // 리스트와 완전히 동일한 폼·상태 초기화를 재사용해서 "총괄 세부화면"이 정확히 열리도록 보장.

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
    const url = archivedView
      ? '/api/admin/customers?archived=true'
      : '/api/admin/customers'
    // Phase 27-L: 이번달·다음달 신청서 fetch → customer_id NULL 인 것을 pendings 로 병합
    // (기존 Phase 7-D 의 `status=신규 & assigned_to=null` 조건은 이미 배정·진행된 신청서를
    //  누락시켜 캘린더 대비 리스트가 비는 gap 을 만들었음)
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth() + 1
    const thisMonth = `${y}-${String(m).padStart(2, '0')}`
    const nextY = m === 12 ? y + 1 : y
    const nextM = m === 12 ? 1 : m + 1
    const nextMonth = `${nextY}-${String(nextM).padStart(2, '0')}`
    const [customersRes, appsThisRes, appsNextRes] = await Promise.all([
      fetch(url),
      archivedView ? Promise.resolve(null) : fetch(`/api/admin/applications?month=${thisMonth}`),
      archivedView ? Promise.resolve(null) : fetch(`/api/admin/applications?month=${nextMonth}`),
    ])
    const data = await customersRes.json()
    setCustomers(data.customers ?? [])
    if (appsThisRes && appsNextRes) {
      try {
        const [j1, j2] = await Promise.all([appsThisRes.json(), appsNextRes.json()])
        const merged = [...(j1.applications ?? []), ...(j2.applications ?? [])]
        // customer 미등록 신청서만 pendings 로 (customer 등록된 회차는 customers 리스트에서 표시)
        const orphaned = merged.filter((a: { customer_id: string | null }) => !a.customer_id)
        setPendingApplications(orphaned)
      } catch {
        setPendingApplications([])
      }
    } else {
      setPendingApplications([])
    }
    setLoading(false)
  }, [archivedView])

  // Phase 27-E: 이번달 매출 fetch + 이번주 슬라이스 + 이번달 주별 breakdown (뷰 모드 무관)
  useEffect(() => {
    if (archivedView || forceCustomerType) return
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth() + 1
    const monthStr = `${y}-${String(m).padStart(2, '0')}`
    const pad = (n: number) => String(n).padStart(2, '0')
    const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

    // 이번주 범위 (월요일 기준)
    const today = new Date(y, now.getMonth(), now.getDate())
    const dow = today.getDay()
    const daysFromMon = dow === 0 ? 6 : dow - 1
    const thisWeekStart = new Date(today); thisWeekStart.setDate(today.getDate() - daysFromMon)
    const thisWeekEnd = new Date(thisWeekStart); thisWeekEnd.setDate(thisWeekStart.getDate() + 7)
    const wsIso = toIso(thisWeekStart)
    const weIso = toIso(thisWeekEnd)

    // 이번달의 모든 주 범위 산출 (달력 주 기준: 월요일~일요일, 이번달 날짜 포함하는 주 모두)
    const monthStartDate = new Date(y, now.getMonth(), 1)
    const monthEndDate = new Date(y, now.getMonth() + 1, 0)
    const firstDow = monthStartDate.getDay()
    const firstMonOffset = firstDow === 0 ? -6 : 1 - firstDow // 1일 기준 이번 주 월요일 오프셋
    const weekRanges: Array<{ start: Date; end: Date }> = []
    const cursor = new Date(monthStartDate); cursor.setDate(monthStartDate.getDate() + firstMonOffset)
    while (cursor <= monthEndDate) {
      const start = new Date(cursor)
      const end = new Date(cursor); end.setDate(cursor.getDate() + 6)
      weekRanges.push({ start, end })
      cursor.setDate(cursor.getDate() + 7)
    }

    fetch(`/api/admin/applications?month=${monthStr}`)
      .then(r => r.json())
      .then(j => {
        const apps = (j.applications ?? []) as Array<{
          construction_date: string | null
          service_type: string | null
          supply_amount: number | null
          vat: number | null
          payment_method: string | null
        }>
        let monthSum = 0
        let weekSum = 0
        const perWeek = weekRanges.map(() => 0)
        for (const a of apps) {
          const amt = computeAppAmount(a)
          if (amt <= 0 || !a.construction_date) continue
          const d = a.construction_date.slice(0, 10)
          monthSum += amt
          if (d >= wsIso && d < weIso) weekSum += amt
          for (let i = 0; i < weekRanges.length; i++) {
            const r = weekRanges[i]
            if (d >= toIso(r.start) && d <= toIso(r.end)) {
              perWeek[i] += amt
              break
            }
          }
        }
        // WeekBreakdown 배열 (이번달 범위 안의 날짜만 라벨에 표시)
        const weeks: WeekBreakdown[] = weekRanges.map((r, i) => {
          // 라벨: 이번달 안의 시작일~종료일 (달 벗어나면 clamp)
          const s = r.start < monthStartDate ? monthStartDate : r.start
          const e = r.end > monthEndDate ? monthEndDate : r.end
          const label = `${s.getMonth() + 1}.${s.getDate()} ~ ${e.getMonth() + 1}.${e.getDate()}`
          const isCurrent = wsIso >= toIso(r.start) && wsIso <= toIso(r.end)
          // Phase 27-J: 리스트 divider 삽입 매칭용 raw ISO (월~일)
          return { label, amount: perWeek[i], isCurrent, startIso: toIso(r.start), endIso: toIso(r.end) }
        })
        setRevenueSummary({ week: weekSum, month: monthSum, weeks })
      })
      .catch(() => setRevenueSummary({ week: 0, month: 0, weeks: [] }))
  }, [archivedView, forceCustomerType])

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
    construction_time: c.construction_time ?? '',
    phone_notify_1: c.phone_notify_1 ?? true,
    phone_notify_2: c.phone_notify_2 ?? false,
    // Phase 9-C: 진행/결제 상태
    progress_status: c.progress_status ?? '',
    payment_status_detail: c.payment_status_detail ?? '',
    // Phase 20-C / 22: 투입주기 (TEXT — 그대로 로드)
    injection_cycle_months: c.injection_cycle_months ?? '',
  })

  const handleSelect = (c: Customer) => {
    // Phase 7-D / Phase 14: 신청서 폼 유입(app:${appId}) — appToCustomerLike에서 이미 전체 필드 매핑됨
    // toForm(c)로 신규 등록 폼에 모든 필드 자동 프리필 (연락처2·이메일·사업자번호·계좌·영업시간·엘리베이터·건물접근·주차·결제방법·요청사항 등)
    if (c.id.startsWith('app:')) {
      setSelected(null); setIsNew(true); setNotifyType('')
      setNotifyLogs([])
      setForm(toForm(c))
      setVisitWeekdays(c.visit_weekdays ?? [])
      setVisitMonthlyDates(c.visit_monthly_dates ?? [])
      setPrepaidPeriods(1)
      toast('신청서 정보로 신규 고객 등록 폼을 채웠습니다. 검토 후 저장하세요.', { icon: 'ℹ️' })
      return
    }
    setSelected(c); setIsNew(false); setNotifyType('')
    setForm(toForm(c))
    setVisitWeekdays(c.visit_weekdays ?? [])
    setVisitMonthlyDates(c.visit_monthly_dates ?? [])
    setPrepaidPeriods(1)
    // Phase A-3: 알림 발송 이력 로딩
    setNotifyLogs((c.notification_log ?? []).map(dbLogToNotifyLog))
  }

  // Phase 27: 캘린더에서 회차 선택 → 리스트 클릭과 완전히 동일한 세부화면 오픈 + 캘린더 focus 저장
  // handleSelect를 그대로 재사용해서 폼·요일·일자·미리결제·알림이력 모두 정합 초기화됨.
  // Phase 27-G: customer_id 없는 신청서 유입 회차는 app-like Customer로 변환 후 신규 등록 폼으로 오픈
  //   (기존 pendingApplications 처리 패턴과 동일 — handleSelect가 'app:' 프리픽스 감지)
  const handleCalendarSelect = (app: CalendarApp) => {
    if (!app.customer_id) {
      // 신청서 유입 → customer-like 객체로 변환 (pendingApplications 매핑과 동일 필드 세트)
      const nowIso = new Date().toISOString()
      const customerLike: Customer = {
        id: `app:${app.id}`,
        business_name: app.business_name || '(업체명 미기재)',
        contact_name: app.owner_name ?? '',
        contact_phone: app.phone ?? '',
        contact_phone_2: app.phone_2 ?? null,
        email: app.email ?? null,
        address: app.address ?? '',
        address_detail: null,
        business_number: app.business_number ?? null,
        account_number: app.account_number ?? null,
        platform_nickname: app.platform_nickname ?? null,
        payment_method: app.payment_method ?? null,
        elevator: app.elevator ?? null,
        building_access: app.building_access ?? null,
        access_method: app.access_method ?? null,
        business_hours_start: app.business_hours_start ?? null,
        business_hours_end: app.business_hours_end ?? null,
        door_password: null,
        parking_info: app.parking ?? null,
        special_notes: app.request_notes ?? null,
        admin_notes: app.admin_notes ?? app.admin_request_notes ?? null,
        care_scope: app.care_scope ?? null,
        pipeline_status: '',
        customer_type: (app.service_type as CustomerType) ?? '1회성케어',
        status: 'active',
        billing_cycle: null, billing_amount: null, billing_start_date: null, billing_next_date: null,
        contract_start_date: null, contract_end_date: null,
        unit_price: null, visit_interval_days: null,
        next_visit_date: app.construction_date ?? null,
        visit_schedule_type: null, visit_weekdays: null, visit_monthly_dates: null,
        notes: null, disposition: null, grade: null,
        rotation_type: null, visit_count_per_month: null,
        payment_status: null, payment_date: null,
        assigned_user_id: app.assigned_to ?? null,
        assigned_worker_id: null,
        deposit: app.deposit ?? null,
        supply_amount: app.supply_amount ?? null,
        vat: app.vat ?? null,
        balance: app.balance ?? null,
        user_id: null, account_user_id: null,
        notification_log: null, phone_notify_1: null, phone_notify_2: null,
        construction_time: app.construction_time ?? null,
        deposit_payment_url: null, balance_payment_url: null,
        deposit_portone_id: null, balance_portone_id: null,
        deposit_paid_at: null, balance_paid_at: null,
        billing_key: null,
        progress_status: '신청서작성',
        payment_status_detail: null,
        injection_cycle_months: null,
        created_at: nowIso,
        updated_at: nowIso,
      }
      handleSelect(customerLike)
      return
    }

    const customer = customers.find(c => c.id === app.customer_id)
    if (!customer) {
      toast.error('이 회차의 고객 정보를 찾을 수 없습니다.')
      return
    }
    // 시공일자에서 월(YYYY-MM) 추출 → 이번달 일정 섹션이 그 월로 자동 이동
    const month = app.construction_date ? app.construction_date.slice(0, 7) : undefined
    setCalendarFocus(month ? { appId: app.id, month } : null)
    // 리스트 클릭과 동일 로직 재사용 — "총괄 세부화면"이 정확히 열림
    handleSelect(customer)
  }

  const handleNew = () => {
    setSelected(null); setIsNew(true); setNotifyType('')
    setNotifyLogs([])
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
    // Phase 7-H: 시공일자 저장 필드 누락 버그 수정 — toForm에는 있으나 buildBody에서 빠져있어 저장 시마다 값 손실됨
    next_visit_date: form.next_visit_date || null,
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
    // Phase A-5: 시공시간, 전화 발송 체크박스
    construction_time: form.construction_time || null,
    phone_notify_1: form.phone_notify_1,
    phone_notify_2: form.phone_notify_2,
    // Phase 9-C: 진행/결제 상태 (1회성 세부 필드)
    progress_status: form.progress_status || null,
    payment_status_detail: form.payment_status_detail || null,
    // Phase 20-C / 22: 투입주기 (TEXT — 자유 표현)
    injection_cycle_months: form.injection_cycle_months?.trim() || null,
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

  // Phase 2-F: 저장 후 방문일정에 맞춰 배정관리(service_applications) 자동 갱신
  // 조건: 정기딥/엔드 + 담당자 존재 + 방문일정 세팅 완료
  // Phase 5-I: 계약일정 저장/생성은 기간 모달로 대체 (openScheduleGenModal + handleGenerateSchedulesBulk)
  // 기존 handleContractSaveAndCleanup, autoRegenerateSchedules 함수는 제거됨

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
        // Phase 27-Z fix: duplicate 경로에서도 customer 키 보장 (백엔드 라인 198 통일). 방어적 가드 유지.
        const newCustomer = data.customer as Customer | undefined
        if (!newCustomer) {
          toast.error('고객 응답 형식이 올바르지 않습니다. 새로고침 후 다시 시도해주세요.')
          return
        }
        // 이미 등록된 고객(같은 업체명) 이면 그 고객으로 전환 안내
        if (data.skipped) {
          setCustomers(prev => prev.some(c => c.id === newCustomer.id) ? prev : [newCustomer, ...prev])
          handleSelect(newCustomer)
          setIsNew(false)
          toast(`같은 업체명의 고객이 이미 있어 기존 정보로 전환합니다.`, { icon: 'ℹ️', duration: 4000 })
          return
        }
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

  // Phase 5-G: 이력탭에서 개별 되돌리기 (archived → active)
  const handleUnarchiveSingle = async () => {
    if (!selected) return
    if (!confirm(`"${selected.business_name}"을(를) 고객관리로 되돌리시겠습니까?`)) return
    try {
      const res = await fetch('/api/admin/customers/archive', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [selected.id] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '되돌리기 실패')
      toast.success('고객관리로 복원되었습니다.')
      setCustomers(prev => prev.filter(c => c.id !== selected.id))
      setSelected(null); setIsNew(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '되돌리기 실패')
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
   * Phase 5-E: 기간 기반 모달 오픈 — mode에 따라 생성/수정 분기
   * - 'create': 신규 일정 생성 (기간 내 방문일자 새로 만듦)
   * - 'cleanup': 기존 미완료 일정 정리 (기간 내 새 방문일정에 없는 것 삭제, INSERT X)
   */
  const openScheduleGenModal = (mode: 'create' | 'cleanup' = 'create') => {
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
    // 기본값: 오늘 ~ 다음달 말일
    const now = new Date()
    const startDate = now.toISOString().slice(0, 10)
    const endOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0)
    const endDate = endOfNextMonth.toISOString().slice(0, 10)
    setScheduleGenModal({ open: true, mode, startDate, endDate, submitting: false })
  }

  /**
   * Phase 5-E: 기간(startDate~endDate)을 월 단위로 순회하며 API 호출.
   * mode='cleanup'이면 cleanup_only 파라미터 전달 (INSERT 스킵).
   * 모달의 [진행] 버튼에서 호출됨.
   */
  const handleGenerateSchedulesBulk = async (startDate: string, endDate: string, mode: 'create' | 'cleanup') => {
    const regularIds = checkedIds.filter(id => {
      const c = customers.find(c => c.id === id)
      return c?.customer_type === '정기딥케어' || c?.customer_type === '정기엔드케어'
    })
    if (regularIds.length === 0) return
    if (startDate > endDate) { toast.error('종료일이 시작일보다 앞섭니다.'); return }

    // 기간 내의 (year, month) 세그먼트 생성
    const [sy, sm, sd] = startDate.split('-').map(Number)
    const [ey, em, ed] = endDate.split('-').map(Number)
    const segments: Array<{ year: number; month: number; start_day: number; end_day: number }> = []
    let curY = sy, curM = sm
    while (curY < ey || (curY === ey && curM <= em)) {
      const isFirst = (curY === sy && curM === sm)
      const isLast = (curY === ey && curM === em)
      const daysInMonth = new Date(curY, curM, 0).getDate()
      segments.push({
        year: curY, month: curM,
        start_day: isFirst ? sd : 1,
        end_day: isLast ? ed : daysInMonth,
      })
      curM += 1
      if (curM > 12) { curM = 1; curY += 1 }
    }

    // 계약 정보 저장(cleanup 모드일 때) — 저장 버튼의 의미상 계약 저장 함께 수행
    if (mode === 'cleanup' && selected) {
      try {
        const body = buildBody()
        await fetch('/api/admin/customers', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: selected.id, ...body }),
        })
      } catch { /* 저장 실패 시 무시하고 진행 (사용자 인지 위해 toast만) */ }
    }

    setBulkCreating(true)
    setScheduleGenModal((s) => ({ ...s, submitting: true }))
    try {
      let totalInserted = 0
      let totalSkipped = 0
      for (const seg of segments) {
        const res = await fetch('/api/admin/customers/generate-schedules', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_ids: regularIds,
            year: seg.year, month: seg.month,
            start_day: seg.start_day, end_day: seg.end_day,
            // 저장(cleanup 모드) = regenerate: 기존 미완료 삭제 + 새 방문일정으로 신규 생성
            // 생성(create 모드) = 기존 유지 + 없는 날짜만 신규 추가
            regenerate: mode === 'cleanup',
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok) {
          totalInserted += Number(data.totalInserted ?? 0)
          const segSkipped = (data.results as Array<{ skipped: number }> | undefined)
            ?.reduce((s, r) => s + Number(r.skipped ?? 0), 0) ?? 0
          totalSkipped += segSkipped
        }
      }
      if (mode === 'cleanup') {
        // customers 저장분 리스트 반영
        if (selected) {
          setCustomers(prev => prev.map(c => c.id === selected.id ? { ...c, ...buildBody() } as Customer : c))
        }
        toast.success(totalInserted > 0
          ? `기간 내 기존 일정 정리 후 ${totalInserted}건이 새 방문일정으로 재생성되었습니다.`
          : '기간 내 재생성할 일정이 없습니다. (방문 주기 확인)')
      } else {
        if (totalInserted === 0) toast(`기간 내 신규 생성할 일정이 없습니다. (${totalSkipped}건 이미 존재)`, { icon: 'ℹ️' })
        else toast.success(`${totalInserted}건 생성 완료${totalSkipped > 0 ? ` (${totalSkipped}건 이미 존재)` : ''}`)
      }
      setCheckedIds([])
      setScheduleGenModal((s) => ({ ...s, open: false, submitting: false }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '일정 처리 실패')
      setScheduleGenModal((s) => ({ ...s, submitting: false }))
    } finally { setBulkCreating(false) }
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

  // Phase 4: 선택 항목을 고객DB이력으로 이관 (soft archive) 또는 이관 취소
  const handleArchiveBulk = async () => {
    if (checkedIds.length === 0) return
    const label = archivedView ? '고객관리로 되돌리기' : '고객DB이력으로 이관'
    if (!confirm(`선택한 ${checkedIds.length}건을 ${label}하시겠습니까?`)) return
    setBulkCreating(true)
    try {
      const res = await fetch('/api/admin/customers/archive', {
        method: archivedView ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: checkedIds, archived_by: currentUserId ?? null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '실패')
      setCustomers(prev => prev.filter(c => !checkedIds.includes(c.id)))
      if (selected && checkedIds.includes(selected.id)) { setSelected(null); setIsNew(false) }
      setCheckedIds([])
      toast.success(`${data.count}건 처리되었습니다.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '실패')
    } finally {
      setBulkCreating(false)
    }
  }

  // Phase 7-J: handleCreateApplicationBulk 제거 — "서비스 신청서 생성 →" 버튼 삭제로 미사용

  // Phase 27-W: pending 신청서(id='app:xxx') 개별 정리 액션.
  // customers 벌크 API 는 service_applications 를 못 다루므로 서비스관리 탭 통합 후
  // 신청서에 대한 이관/삭제 UX 가 통째로 사라졌던 gap 을 국소적으로 복원.
  // 두 API 는 이미 존재: POST /api/admin/applications/archive · DELETE /api/admin/applications?id=
  const handleArchivePendingApp = async (appId: string) => {
    if (!confirm('이 신청서를 고객DB이력으로 이관하시겠습니까?')) return
    try {
      const res = await fetch('/api/admin/applications/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [appId], archived_by: currentUserId ?? null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? '이관 실패')
      setPendingApplications(prev => prev.filter(a => a.id !== appId))
      toast.success('신청서를 이력으로 이관했습니다.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '이관 실패')
    }
  }

  const handleDeletePendingApp = async (appId: string) => {
    if (!confirm('이 신청서를 삭제하시겠습니까?\n연결된 일정도 함께 소프트 삭제됩니다.')) return
    try {
      const res = await fetch(`/api/admin/applications?id=${appId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? '삭제 실패')
      setPendingApplications(prev => prev.filter(a => a.id !== appId))
      toast.success('신청서를 삭제했습니다.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '삭제 실패')
    }
  }

  // Phase 27-W: 신청서 복제 (기존 /api/admin/applications/[id]/duplicate 재사용).
  // 원본과 무관한 별도 레코드 생성 — 상태·알림이력·드라이브 폴더·notion 페이지 등 초기화됨.
  // 복제본은 여전히 customer_id=null 이므로 pendings 로 자동 편입.
  const handleDuplicatePendingApp = async (appId: string) => {
    if (!confirm('이 신청서를 복제하시겠습니까?\n복제본은 원본과 관계없는 별도 신청서로 생성됩니다.')) return
    try {
      const res = await fetch(`/api/admin/applications/${appId}/duplicate`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? '복제 실패')
      // 낙관적 업데이트 — 복제본은 customer_id null 이므로 pendings 리스트 상단에 즉시 노출.
      // 서버 응답의 application 객체를 그대로 push (필드 세트가 loadCustomers 와 동일).
      if (data.application) {
        setPendingApplications(prev => [data.application, ...prev])
      }
      toast.success('신청서를 복제했습니다.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '복제 실패')
    }
  }

  const handleNotify = async () => {
    if (!selected || !notifyType) { toast.error('알림 유형을 선택하세요.'); return }
    setSending(true)
    try {
      const res = await fetch('/api/admin/customers/notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: selected.id, type: notifyType, method: 'manual' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '발송 실패')
      const nowIso = new Date().toISOString()
      const log: NotifyLog = { type: notifyType, sentAt: nowIso, method: 'manual' }
      const dbEntry = { type: notifyType, sent_at: nowIso, method: 'manual' as const }
      setNotifyLogs(prev => [log, ...prev])
      setSelected(prev => prev ? {
        ...prev,
        notification_log: [dbEntry, ...(prev.notification_log ?? [])],
      } : prev)
      setCustomers(prev => prev.map(c => c.id === selected.id ? {
        ...c,
        notification_log: [dbEntry, ...(c.notification_log ?? [])],
      } : c))
      toast.success(`${notifyType} 발송 완료`)
      setNotifyType('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '발송 실패')
    } finally { setSending(false) }
  }

  const handleResend = async (type: string) => {
    if (!selected) return
    setSending(true)
    try {
      const res = await fetch('/api/admin/customers/notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: selected.id, type, method: 'manual' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '재발송 실패')
      const nowIso = new Date().toISOString()
      const log: NotifyLog = { type: `[재발송] ${type}`, sentAt: nowIso, method: 'manual' }
      const dbEntry = { type, sent_at: nowIso, method: 'manual' as const }
      setNotifyLogs(prev => [log, ...prev])
      setSelected(prev => prev ? {
        ...prev,
        notification_log: [dbEntry, ...(prev.notification_log ?? [])],
      } : prev)
      setCustomers(prev => prev.map(c => c.id === selected.id ? {
        ...c,
        notification_log: [dbEntry, ...(c.notification_log ?? [])],
      } : c))
      toast.success(`${type} 재발송 완료`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '재발송 실패')
    } finally { setSending(false) }
  }

  // Phase A-4: 포트원 결제 링크 생성/복사 (1회성케어 예약금·잔금)
  const handleSendPaymentLink = async (stage: 'deposit' | 'balance') => {
    if (!selected) return
    setSendingPaymentLink(true)
    try {
      const res = await fetch('/api/portone/issue-payment-link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: selected.id, stage }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '결제링크 생성 실패')
      await navigator.clipboard.writeText(data.paymentUrl)
      toast.success(data.reused ? '기존 결제링크 복사됨' : '결제링크 생성 · 클립보드 복사됨')
      const urlField = stage === 'deposit' ? 'deposit_payment_url' : 'balance_payment_url'
      const idField  = stage === 'deposit' ? 'deposit_portone_id'   : 'balance_portone_id'
      const patch = { [urlField]: data.paymentUrl, [idField]: data.paymentId }
      setCustomers(prev => prev.map(c => c.id === selected.id ? { ...c, ...patch } : c))
      setSelected(prev => prev ? { ...prev, ...patch } : prev)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '결제링크 생성 실패')
    } finally {
      setSendingPaymentLink(false)
    }
  }

  const handleChargeBalance = async () => {
    if (!selected) return
    if (!confirm('잔금을 자동 청구하시겠습니까?\n고객 카드에서 즉시 결제됩니다.')) return
    setChargingBalance(true)
    try {
      const res = await fetch('/api/portone/charge-balance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: selected.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '잔금 청구 실패')
      toast.success(`잔금 ${Number(data.chargedAmount ?? 0).toLocaleString('ko-KR')}원 청구 완료`)
      const nowIso = new Date().toISOString()
      setCustomers(prev => prev.map(c => c.id === selected.id ? { ...c, balance_paid_at: nowIso } : c))
      setSelected(prev => prev ? { ...prev, balance_paid_at: nowIso } : prev)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '잔금 청구 실패')
    } finally {
      setChargingBalance(false)
    }
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

    // Phase 6-B: 미배정 필터 — 담당자 없음 OR (1회성이면서 시공일자 없음)
    if (showUnassignedOnly) {
      list = list.filter(c => {
        const noManager = !c.assigned_user_id
        const isOnce = c.customer_type === '1회성케어'
        const noConstructionDate = isOnce && !c.next_visit_date
        return noManager || noConstructionDate
      })
    }

    // Phase 27-L: customer 미등록 신청서(pendings) 를 상시 병합.
    // 이전(Phase 7-D)에는 `showUnassignedOnly` 조건 안에만 병합해서, 신청서가 배정·진행 상태이지만
    // customer 로 등록 안 된 회차가 리스트에서 통째로 누락됐음(캘린더에는 표시됨) — 그 gap 해결.
    if (!archivedView && pendingApplications.length > 0) {
      // Phase 27-V: 이미 customers 에 phone/business_name 매칭되는 pendings 는 중복 제거.
      // 신청서 접수 시 customer_id 를 자동 매칭 못 해서 발생하는 "원본 + 신청서 딱지" 이중 노출 방지.
      const existingPhones = new Set(
        customers
          .map(c => (c.contact_phone ?? '').replace(/-/g, ''))
          .filter(p => p.length > 0)
      )
      const existingBizNames = new Set(
        customers
          .map(c => (c.business_name ?? '').trim())
          .filter(n => n.length > 0)
      )
      const pendings: Customer[] = pendingApplications
        .filter(a => {
          // Phase 27-V: 이미 customers 에 등록된 phone/business_name 은 제외 (중복 방지)
          const appPhone = (a.phone ?? '').replace(/-/g, '')
          if (appPhone && existingPhones.has(appPhone)) return false
          const appBiz = (a.business_name ?? '').trim()
          if (appBiz && existingBizNames.has(appBiz)) return false
          // 유형 필터 활성 시 신청서 service_type도 함께 필터
          if (selectedTypes.size > 0) {
            const t = (a.service_type ?? '1회성케어') as CustomerType
            let matched = false
            for (const opt of selectedTypes) {
              if (matchesCustomerFilter(t, opt)) { matched = true; break }
            }
            if (!matched) return false
          }
          // 미배정 필터 활성 시 pendings 도 동일 규칙 적용
          if (showUnassignedOnly) {
            const noManager = !a.assigned_to
            const isOnce = a.service_type === '1회성케어'
            const noConstructionDate = isOnce && !a.construction_date
            if (!(noManager || noConstructionDate)) return false
          }
          return true
        })
        .map(a => ({
          id: `app:${a.id}`,
          // Phase 14: 신청서 → Customer 전체 필드 매핑
          business_name: a.business_name ?? '(업체명 미기재)',
          contact_name: a.owner_name ?? '',
          contact_phone: a.phone ?? '',
          contact_phone_2: a.phone_2 ?? null,
          email: a.email ?? null,
          address: a.address ?? '',
          address_detail: null,
          business_number: a.business_number ?? null,
          account_number: a.account_number ?? null,
          platform_nickname: a.platform_nickname ?? null,
          payment_method: a.payment_method ?? null,
          elevator: a.elevator ?? null,
          building_access: a.building_access ?? null,
          access_method: a.access_method ?? null,
          business_hours_start: a.business_hours_start ?? null,
          business_hours_end: a.business_hours_end ?? null,
          door_password: null,
          parking_info: a.parking ?? null,        // parking → parking_info
          special_notes: a.request_notes ?? null, // request_notes → special_notes
          admin_notes: a.admin_notes ?? a.admin_request_notes ?? null,
          care_scope: a.care_scope ?? null,
          pipeline_status: '',
          customer_type: (a.service_type as CustomerType) ?? '1회성케어',
          status: 'active',
          billing_cycle: null, billing_amount: null, billing_start_date: null, billing_next_date: null,
          contract_start_date: null, contract_end_date: null,
          unit_price: a.unit_price_per_visit ?? null,
          visit_interval_days: null,
          next_visit_date: a.construction_date ?? null,
          visit_schedule_type: null, visit_weekdays: null, visit_monthly_dates: null,
          notes: null, disposition: null, grade: null,
          rotation_type: null, visit_count_per_month: null,
          payment_status: null, payment_date: null,
          assigned_user_id: a.assigned_to ?? null,
          assigned_worker_id: null,
          deposit: a.deposit ?? null,
          supply_amount: a.supply_amount ?? null,
          vat: a.vat ?? null,
          balance: a.balance ?? null,
          user_id: null, account_user_id: null,
          notification_log: null, phone_notify_1: null, phone_notify_2: null,
          construction_time: a.construction_time ?? null,
          deposit_payment_url: null, balance_payment_url: null,
          deposit_portone_id: null, balance_portone_id: null,
          deposit_paid_at: null, balance_paid_at: null,
          billing_key: null,
          progress_status: a.status ?? '신청서작성',
          payment_status_detail: null,
          injection_cycle_months: null,
          created_at: a.created_at,
          updated_at: a.created_at,
        }))
      // pendings 를 상단에 배치 (신규·시공 임박 강조)
      list = [...pendings, ...list]
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
        } else if (sortKey === 'construction_date') {
          av = a.next_visit_date ?? ''
          bv = b.next_visit_date ?? ''
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
    } else {
      // Phase 6-E: 1회성 단독 선택 시 시공일자 미래→과거, 그 외에는 created_at 최신순
      const oneTimeOnly = selectedTypes.size === 1 && (selectedTypes.has('1회성케어') || selectedTypes.has('일반일정'))
      if (oneTimeOnly) {
        list = [...list].sort((a, b) => (b.next_visit_date ?? '').localeCompare(a.next_visit_date ?? ''))
      } else {
        list = [...list].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
      }
    }

    return list
  }, [customers, isAdmin, currentUserId, selectedTypes, search, sortKey, sortDir, selectedStaffId, staffList, showUnassignedOnly, pendingApplications, archivedView])

  // Phase 18: 유형 필터 활성 시 리스트 상단 30일치만 우선 로드 (전체는 "더 보기" 클릭)
  const [showAllInFilter, setShowAllInFilter] = useState(false)
  useEffect(() => { setShowAllInFilter(false) }, [selectedTypes])
  const displayed = useMemo(() => {
    if (showAllInFilter || selectedTypes.size === 0) return filtered
    if (filtered.length === 0) return filtered
    // 최상단 항목의 next_visit_date 기준 -30일 범위만
    const topRow = filtered.find(c => c.next_visit_date)
    if (!topRow?.next_visit_date) return filtered.slice(0, 100) // fallback: 상위 100건
    const topTs = new Date(topRow.next_visit_date).getTime()
    const cutoffTs = topTs - 30 * 24 * 60 * 60 * 1000
    return filtered.filter(c => {
      if (!c.next_visit_date) return true // 시공일자 없는 건은 항상 노출 (미정)
      return new Date(c.next_visit_date).getTime() >= cutoffTs
    })
  }, [filtered, showAllInFilter, selectedTypes])
  const hiddenCount = filtered.length - displayed.length

  // Phase 6-D: 미배정 ↔ 유형 상호 배타 — 유형 클릭 시 미배정 자동 해제
  const toggleType = (t: FilterOption) => {
    if (showUnassignedOnly) setShowUnassignedOnly(false)
    setSelectedTypes(prev => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  // 미배정 토글 — 미배정 활성화 시 유형 필터 자동 클리어 (전체 유형에서 미배정만)
  const toggleUnassigned = () => {
    setShowUnassignedOnly(prev => {
      const next = !prev
      if (next) setSelectedTypes(new Set())
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

  // Phase 2-E: 이번달 일정 아코디언에 노출할 작업자 (정직원 + 인턴 + 일용직)
  const flexibleWorkers = useMemo(() =>
    workersList.filter(w => ['정직원', '인턴', '일용직'].includes(w.employment_type ?? '')),
  [workersList])
  const isDipCare = form.customer_type === '정기딥케어'
  // Phase 17: 일반일정도 1회성과 동일 세부화면 사용 (시공일자·금액·진행/결제 상태 등)
  const isOnceCare = form.customer_type === '1회성케어' || form.customer_type === '일반일정'

  // Phase 25d: notification_templates DB에서 유형별 알림 목록 동적 로드
  const [dbNotifyCodes, setDbNotifyCodes] = useState<Record<string, string[]>>({})
  useEffect(() => {
    if (!form.customer_type) return
    if (dbNotifyCodes[form.customer_type]) return  // 이미 로드됨
    fetch(`/api/admin/notification-templates?type=${encodeURIComponent(form.customer_type)}&location=customer_detail&active_only=true`)
      .then(r => r.json())
      .then(j => {
        const codes = ((j.templates ?? []) as Array<{ code: string }>).map(t => t.code)
        setDbNotifyCodes(prev => ({ ...prev, [form.customer_type!]: codes }))
      })
      .catch(() => {})
  }, [form.customer_type, dbNotifyCodes])

  // Phase 27-AA: 하드코딩 NOTIFY_TYPES fallback 완전 제거 — notification_templates DB 를
  // 단일 진실 소스(single source of truth)로 삼는다. 이유: 하드코딩 dropdown 에는 있는데
  // DB 에는 없는 "유령 알림"(예: 결제알림(현금)) 을 선택·발송하면 문자알림관리 탭에서
  // 통제되지 않는 문구가 나가는 감사·회계 리스크. 문자알림관리 탭에서 만들어야만 dropdown
  // 에도 노출되도록 강제. NOTIFY_TYPES 상수는 이력 표시 badge 매핑용으로만 남김.
  const notifyLoading = !!form.customer_type && dbNotifyCodes[form.customer_type] === undefined

  // Phase 19: 정기딥+연간 = 이미 결제완료 → 결제 계열 알림 옵션 필터링
  const notifyOptions = (() => {
    if (!form.customer_type) return []
    const base = dbNotifyCodes[form.customer_type] ?? []
    if (form.customer_type === '정기딥케어' && form.billing_cycle === '연간') {
      const paymentRelated = new Set([
        '결제알림', '결제알림(현금)', '결제알림(카드,플렛폼)',
        '결제완료알림', '결제완료알림(잔금)',
        '예약금 입금완료 알림',
        '계산서발행완료알림', '예약금환급완료알림',
      ])
      return base.filter(t => !paymentRelated.has(t))
    }
    return base
  })()

  // Phase 9-D: 1회성 embed 제거 이후 isEmbedActive 는 항상 false — 검색·필터·액션바 항상 노출
  const isEmbedActive = false

  return (
    <>
    <div className="relative flex h-full gap-0 min-h-0">
      {/* ── 좌측: 목록 ── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          {/* Phase 4: embed 모드에서는 자체 헤더 숨김 — 부모 페이지 헤더와 중복 방지 */}
          {!embedded
            ? <h1 className="text-2xl font-bold text-text-primary">고객 관리</h1>
            : <div />}
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => { fetchAll(); setEmbedRefetchKey(k => k + 1) }}>새로고침</Button>
            {!isWorker && !embedded && (
              <Button size="sm" onClick={handleNew}>+ 고객 추가</Button>
            )}
          </div>
        </div>


        {/* 검색 + 직원 필터 — Phase 6-H: embed 활성 시 숨김 (embed 뷰 자체 검색·필터 사용) */}
        <div className={`gap-2 mb-4 ${isEmbedActive ? 'hidden' : 'flex'}`}>
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="업체명, 담당자, 연락처, 주소, 케어범위, 계좌·사업자번호, 금액 검색..."
              className="w-full pl-10 pr-9 py-2.5 text-sm text-text-primary border border-border rounded-xl bg-surface shadow-soft focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 placeholder:text-text-tertiary" />
            {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary text-sm">✕</button>}
          </div>
          <select
            value={selectedStaffId ?? ''}
            onChange={e => setSelectedStaffId(e.target.value || null)}
            className="py-2.5 px-3 text-sm text-text-primary border border-border rounded-xl bg-surface shadow-soft focus:outline-none focus:ring-2 focus:ring-brand-500 min-w-[120px]"
          >
            <option value="">담당자 전체</option>
            {staffList.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Phase 27-J: 유형 필터 + 미배정 + 뷰 토글을 한 줄로 통합 (라벨 축약, 토글 1개) */}
        <div className={`flex flex-wrap items-center gap-1.5 mb-3 ${forceCustomerType ? 'hidden' : ''}`}>
          {FILTER_OPTIONS.map(t => {
            const checked = selectedTypes.has(t)
            return (
              <button key={t} onClick={() => toggleType(t)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  checked
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-surface text-text-secondary border-border hover:border-blue-400'
                }`}>
                <span>{FILTER_SHORT_LABEL[t]}</span>
                <span className={`text-xs px-1 py-0.5 rounded-full ${
                  checked ? 'bg-brand-500 text-white' : 'bg-surface-sunken text-text-secondary'
                }`}>
                  {typeCounts[t] ?? 0}
                </span>
              </button>
            )
          })}
          <button onClick={() => { setSelectedTypes(new Set()); setShowUnassignedOnly(false) }}
            className={`px-2 py-1 text-xs border rounded-lg transition-colors ${
              selectedTypes.size === 0 && !showUnassignedOnly
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-surface text-text-secondary border-border hover:border-blue-400'
            }`}>
            전체 ({typeCounts['전체'] ?? 0})
          </button>
          {/* Phase 6-B/D: 미배정 토글 — 유형과 상호 배타 */}
          <button onClick={toggleUnassigned}
            className={`px-2.5 py-1 text-xs border rounded-lg transition-colors font-medium ${
              showUnassignedOnly
                ? 'bg-orange-500 text-white border-orange-500'
                : 'bg-orange-50 text-orange-700 border-orange-200 hover:border-orange-400'
            }`}
            title="담당자 미배정 또는 1회성 시공일자 미설정 건만 표시">
            {showUnassignedOnly && '✓ '}미배정
          </button>
          {/* Phase 27-J: 리스트 ↔ 캘린더 단일 토글 (누를 때마다 반대 뷰로 전환) */}
          {!isWorker && !archivedView && (
            <button
              onClick={() => setViewMode(viewMode === 'list' ? 'calendar' : 'list')}
              className="ml-auto text-xs px-3 py-1 rounded-lg border transition-colors bg-surface border-border text-text-secondary hover:border-brand-400 font-medium"
              title={viewMode === 'list' ? '캘린더 뷰로 전환' : '리스트 뷰로 전환'}
            >
              {viewMode === 'list' ? '📅 캘린더' : '📋 리스트'}
            </button>
          )}
          {/* Phase 27-E: 이번주·이번달 매출 요약 (뷰 토글 옆) */}
          {!isWorker && !archivedView && (revenueSummary.week > 0 || revenueSummary.month > 0) && (
            <div className="flex items-center gap-1">
              <span className="text-[11px] px-2 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold whitespace-nowrap">
                이번주 {fmtAmount(revenueSummary.week)}
              </span>
              <span className="text-[11px] px-2 py-1 rounded-md bg-emerald-100 border border-emerald-300 text-emerald-900 font-bold whitespace-nowrap">
                이번달 {fmtAmount(revenueSummary.month)}
              </span>
            </div>
          )}
        </div>

        {/* 액션 바 — Phase 6-H: embed 활성 시 숨김 (embed 뷰가 자체 액션바 사용) */}
        {checkedIds.length > 0 && !isEmbedActive && (
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
            {!isWorker && (
              <Button size="sm" onClick={handleArchiveBulk} disabled={bulkCreating}
                className={archivedView
                  ? 'bg-sky-600 hover:bg-sky-700 text-white whitespace-nowrap'
                  : 'bg-purple-600 hover:bg-purple-700 text-white whitespace-nowrap'}>
                {bulkCreating ? '처리 중...' : archivedView ? '↩ 고객관리로 되돌리기' : '📦 이력으로 이관'}
              </Button>
            )}
            <Button size="sm" onClick={() => openScheduleGenModal('create')} disabled={bulkCreating} className="bg-green-600 hover:bg-green-700 text-white whitespace-nowrap">
              {bulkCreating ? '처리 중...' : <><Calendar size={14} className="inline mr-1" />일정 생성</>}
            </Button>
            {/* Phase 7-J: "서비스 신청서 생성 →" 버튼 제거 — 서비스관리 흡수 이후 미사용 (사용자 지시).
                "서비스 일정 생성"은 세부화면 계약 정보 섹션의 '생성' 버튼과 동일한 openScheduleGenModal('create') 시나리오 사용. */}
          </div>
        )}

        {/* Phase 27-J: 상단 위치의 주간 breakdown 카드 제거 — 리스트 내부 divider row로 대체됨.
            뷰 토글·이번주/이번달 요약은 유형 필터 라인으로 통합됨. */}

        {/* Phase 27: 캘린더 뷰 or 리스트 뷰 조건 렌더링.
            (Phase 9-D의 1회성 embed dead code는 이 조건 분기로 대체됨) */}
        {viewMode === 'calendar' ? (
          <div className="flex-1 overflow-auto py-1">
            <CustomersCalendarGrid
              onSelectApp={handleCalendarSelect}
              filterTypes={selectedTypes}
            />
          </div>
        ) : (
        <>
        {/* 목록 (검색창은 필터 위로 이동됨) */}
        <div className="bg-surface rounded-2xl border border-border shadow-soft overflow-auto flex-1 min-h-[320px]">
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
                      checked={displayed.filter(c => !c.id.startsWith('app:')).length > 0 && displayed.filter(c => !c.id.startsWith('app:')).every(c => checkedIds.includes(c.id))}
                      onChange={e => setCheckedIds(e.target.checked ? displayed.filter(c => !c.id.startsWith('app:')).map(c => c.id) : [])}
                      className="accent-blue-600 cursor-pointer"
                    />
                  </th>
                  {/* Phase 10: 1회성 단독 필터 시 예전 서비스관리 스타일 컬럼 세트로 자동 전환 */}
                  {/* Phase 22 v6: 정기딥케어 단독 필터 시 4열 컴팩트 뷰로 전환 */}
                  {(() => {
                    // Phase 22 v10: 다중 선택에서도 같은 그룹이면 통합 뷰 유지. 그룹 혼합 시에만 기본(정기) 뷰
                    const oneTimeGroup = new Set(['1회성케어', '일반일정'])
                    const regularGroup = new Set(['정기딥케어', '정기엔드케어'])
                    const selectedArr = Array.from(selectedTypes)
                    const isOneTimeView = selectedArr.length > 0 && selectedArr.every(t => oneTimeGroup.has(t))
                    const isDipCareView = selectedArr.length > 0 && selectedArr.every(t => regularGroup.has(t))
                    if (isOneTimeView) {
                      // Phase 27-H: worker는 결제방법·총액·진행상태·결제상태 컬럼 헤더 자체 숨김
                      return ([
                        { key: 'construction_date' as const, label: '시공일자' },
                        { key: 'business_name' as const, label: '업체명 / 주소' },
                        { key: null, label: '케어범위' },
                        { key: null, label: '담당자' },
                        ...(!isWorker ? [{ key: null, label: '결제방법' } as const, { key: null, label: '총액' } as const] : []),
                        ...(!isWorker ? [{ key: null, label: '진행상태' } as const, { key: null, label: '결제상태' } as const] : []),
                      ] as const)
                    }
                    if (isDipCareView) {
                      // Phase 27-H: worker는 계약정보·결제 상태 요약 컬럼 헤더 자체 숨김
                      return ([
                        { key: 'business_name' as const, label: '일반정보' },
                        { key: null, label: '고객상태' },
                        ...(!isWorker ? [{ key: null, label: '계약정보' } as const] : []),
                        ...(!isWorker ? [{ key: null, label: '결제 상태 요약' } as const] : []),
                      ] as const)
                    }
                    return ([
                      { key: 'construction_date' as const, label: '시공일자' },
                      { key: 'business_name' as const, label: '업체명 / 연락처' },
                      { key: 'service' as const,       label: '유형' },
                      ...(!isWorker ? [{ key: null, label: '결제/청구' } as const] : []),
                      { key: null,            label: '성향' },
                      ...(!isWorker ? [{ key: 'contract' as const, label: '계약기간' }] : []),
                      { key: 'interval' as const,      label: '방문주기' },
                      { key: 'next_visit' as const,    label: '방문일정' },
                    ] as const)
                  })().map(col => (
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
                {(() => {
                  // Phase 27-J: 리스트 내부 주간 divider — 이전 행의 주 인덱스를 IIFE 클로저로 추적
                  let lastWeek = -2
                  // 날짜 정렬 상태에서만 divider 노출 (시공일자 sort or 1회성/일반 단독)
                  const isDateSorted = sortKey === 'construction_date' || sortKey === 'next_visit' ||
                    (!sortKey && selectedTypes.size === 1 && (selectedTypes.has('1회성케어') || selectedTypes.has('일반일정')))
                  const getWeekIdx = (dateStr: string | null | undefined): number => {
                    if (!isDateSorted || !dateStr || revenueSummary.weeks.length === 0) return -1
                    const d = dateStr.slice(0, 10)
                    for (let i = 0; i < revenueSummary.weeks.length; i++) {
                      const w = revenueSummary.weeks[i]
                      if (d >= w.startIso && d <= w.endIso) return i
                    }
                    return -1
                  }
                  return displayed.map(c => {
                  const rawType = c.customer_type ?? '1회성케어'
                  const type: CustomerType = (rawType in TYPE_STYLE ? rawType : '1회성케어') as CustomerType
                  const tStyle = TYPE_STYLE[type] ?? TYPE_STYLE['1회성케어']
                  const sStyle = STATUS_STYLE[c.status ?? 'active']
                  const isSelected = selected?.id === c.id
                  const isChecked = checkedIds.includes(c.id)
                  // Phase 27-J: 이 행이 새 주의 시작이면 divider 삽입
                  const wIdx = getWeekIdx(c.next_visit_date)
                  const showDivider = wIdx >= 0 && wIdx !== lastWeek
                  if (showDivider) lastWeek = wIdx
                  const weekInfo = showDivider ? revenueSummary.weeks[wIdx] : null
                  // Phase 7-D: 신청서 폼 유입은 아직 customer 미등록 → 체크박스·bulk 액션 제외
                  const isPendingApp = c.id.startsWith('app:')
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
                  // Phase 13: 진행상태=좌측 border, 결제상태=행 전체 파스텔 배경, 오늘 시공=sky ring
                  const progressBorder = c.progress_status ? (PROGRESS_ROW_BORDER[c.progress_status] ?? 'border-l-transparent') : 'border-l-transparent'
                  const paymentBg = c.payment_status_detail ? (PAYMENT_ROW_BG[c.payment_status_detail] ?? '') : ''
                  const todayStr = new Date().toISOString().slice(0, 10)
                  const isToday = c.next_visit_date?.slice(0, 10) === todayStr
                  const isPaused = c.status === 'paused'
                  return (
                    <Fragment key={c.id}>
                    {weekInfo && (
                      <tr className="bg-emerald-50/70 border-y border-emerald-200">
                        <td colSpan={99} className="px-3 py-1.5">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[11px] font-semibold text-emerald-900">📅 {weekInfo.label} 주간</span>
                            <span className={`text-xs font-bold tabular-nums ${weekInfo.amount > 0 ? 'text-emerald-800' : 'text-text-tertiary'}`}>
                              {weekInfo.amount > 0 ? fmtAmount(weekInfo.amount) : '금액 없음'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                    <tr
                      className={`border-l-4 ${isToday ? TODAY_ROW_BORDER : progressBorder} ${isToday ? `${TODAY_ROW_BG} ${TODAY_ROW_SHADOW}` : paymentBg} hover:brightness-95 transition-all cursor-pointer ${isSelected ? 'ring-2 ring-brand-500 ring-inset' : ''} ${isChecked ? 'ring-2 ring-brand-400 ring-inset' : ''} ${isPendingApp && !isToday ? 'bg-amber-50' : ''} ${isPaused ? 'bg-gray-100 opacity-60' : ''}`}
                      onClick={() => handleSelect(c)}>
                      {/* Phase 27-W: pending 신청서는 체크박스 대신 개별 이관/삭제 아이콘.
                          service_applications 는 customers 벌크 API 로 다룰 수 없어서 체크박스 자체가 무의미.
                          원래 서비스관리 탭에서 가능했던 개별 정리 UX 를 국소적으로 복원. */}
                      <td
                        className="px-3 py-3"
                        onClick={e => { e.stopPropagation(); if (!isPendingApp) toggleCheck(c.id) }}
                      >
                        {isPendingApp ? (
                          <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => handleDuplicatePendingApp(c.id.replace(/^app:/, ''))}
                              title="복제"
                              aria-label="신청서 복제"
                              className="p-1 rounded hover:bg-yellow-100 text-text-tertiary hover:text-yellow-700 transition-colors"
                            >
                              <Copy size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleArchivePendingApp(c.id.replace(/^app:/, ''))}
                              title="이력으로 이관"
                              aria-label="신청서를 이력으로 이관"
                              className="p-1 rounded hover:bg-brand-100 text-text-tertiary hover:text-brand-700 transition-colors"
                            >
                              <Archive size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeletePendingApp(c.id.replace(/^app:/, ''))}
                              title="삭제"
                              aria-label="신청서 삭제"
                              className="p-1 rounded hover:bg-state-danger-bg text-text-tertiary hover:text-state-danger transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ) : (
                          <input type="checkbox" checked={isChecked} readOnly className="accent-blue-600 pointer-events-none cursor-pointer" />
                        )}
                      </td>
                      {(() => {
                        // Phase 22 v10: 다중 선택에서도 같은 그룹이면 통합 뷰 유지 (헤더 판정과 동일)
                        const oneTimeGroup = new Set(['1회성케어', '일반일정'])
                        const regularGroup = new Set(['정기딥케어', '정기엔드케어'])
                        const selectedArr = Array.from(selectedTypes)
                        const isOneTimeView = selectedArr.length > 0 && selectedArr.every(t => oneTimeGroup.has(t))
                        const isDipCareView = selectedArr.length > 0 && selectedArr.every(t => regularGroup.has(t))
                        // Phase 22 v6: 정기딥케어 4열 컴팩트 뷰
                        if (isDipCareView) {
                          const contractTotal = (Number(c.supply_amount) || 0) + (Number(c.vat) || 0)
                          const cyclePrefix = c.billing_cycle === '연간' ? '연' : '월'
                          return (
                            <>
                              {/* 1열: 일반정보 — 업체명, 고객명, 연락처, 주소 */}
                              <td className="px-3 py-3 min-w-[180px] max-w-[220px]">
                                <p className="text-sm font-semibold text-text-primary truncate">{c.business_name}</p>
                                {c.contact_name && (
                                  <p className="text-xs text-text-secondary mt-0.5 truncate">{c.contact_name}</p>
                                )}
                                {c.contact_phone && (
                                  <p className="text-[11px] text-text-tertiary mt-0.5 font-mono">{c.contact_phone}</p>
                                )}
                                {c.address && (
                                  <p className="text-[11px] text-text-tertiary mt-0.5 truncate">{c.address}</p>
                                )}
                              </td>
                              {/* 2열: 고객상태 — 유형, 등급, 성향 */}
                              <td className="px-3 py-3 min-w-[110px]">
                                <div className="flex flex-col gap-1 items-start">
                                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${tStyle.badge}`}>{type}</span>
                                  {c.grade && (
                                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${GRADE_STYLE[c.grade].badge}`}>{c.grade}</span>
                                  )}
                                  {(() => {
                                    const d = (c.disposition ?? '보통') as CustomerDisposition
                                    return (
                                      <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${DISPOSITION_STYLE[d].badge}`}>{d}</span>
                                    )
                                  })()}
                                </div>
                              </td>
                              {/* Phase 27-H: worker에겐 계약정보·결제 상태 요약 두 컬럼 통째 숨김 */}
                              {!isWorker && (
                                <>
                                  {/* 3열: 계약정보 — 결제주기·총액·계약기간·방문일정 */}
                                  <td className="px-3 py-3 min-w-[180px] max-w-[240px]">
                                    <div className="flex flex-col gap-0.5 text-xs">
                                      <span className="text-text-primary font-semibold">
                                        {cyclePrefix}
                                        {contractTotal > 0 && (
                                          <> · {contractTotal.toLocaleString('ko-KR')}<span className="text-text-tertiary font-normal">원</span></>
                                        )}
                                      </span>
                                      {(c.contract_start_date || c.contract_end_date) && (
                                        <span className="text-[11px] text-text-tertiary">
                                          {fmtDate(c.contract_start_date)} ~ {fmtDate(c.contract_end_date)}
                                        </span>
                                      )}
                                      {visitScheduleText && (
                                        <span className="text-[11px] text-text-secondary">{visitScheduleText}</span>
                                      )}
                                    </div>
                                  </td>
                                  {/* 4열: 결제 상태 요약 */}
                                  <td className="px-3 py-3 min-w-[140px]">
                                    <PaymentIssuesSummary
                                      customerId={c.id}
                                      phone={c.contact_phone ?? null}
                                      businessName={c.business_name}
                                      paymentMethod={c.payment_method ?? null}
                                      customerType={c.customer_type}
                                      compact
                                    />
                                  </td>
                                </>
                              )}
                            </>
                          )
                        }
                        // Phase 10: 1회성 뷰 — 예전 서비스관리 스타일 컬럼
                        if (isOneTimeView) {
                          const total = (Number(c.supply_amount) || 0) + (Number(c.vat) || 0)
                          const managerName = usersList.find(u => u.id === c.assigned_user_id)?.name
                          return (
                            <>
                              {/* 시공일자 (+ 시공시간) */}
                              <td className="px-3 py-3 whitespace-nowrap">
                                {c.next_visit_date
                                  ? <span className="text-xs font-mono text-text-primary">{fmtDate(c.next_visit_date)}</span>
                                  : <span className="text-xs text-text-tertiary">미정</span>}
                                {c.construction_time && (
                                  <div className="text-[11px] text-text-tertiary mt-0.5">{c.construction_time.slice(0, 5)}시</div>
                                )}
                              </td>
                              {/* 업체명 + 주소 (+ 신청서 뱃지) */}
                              <td className="px-3 py-3 max-w-[220px]">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="text-sm font-semibold text-text-primary truncate">{c.business_name}</p>
                                  {isPendingApp && (
                                    <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium shrink-0">신청서</span>
                                  )}
                                </div>
                                {c.address && (
                                  <p className="text-[11px] text-text-tertiary mt-0.5 truncate">{c.address}</p>
                                )}
                                <p className="text-[11px] text-text-secondary mt-0.5">{c.contact_name} · {c.contact_phone}</p>
                              </td>
                              {/* 케어범위 */}
                              <td className="px-3 py-3 max-w-[180px]">
                                {c.care_scope
                                  ? <span className="text-xs text-text-secondary line-clamp-2 leading-snug">{c.care_scope}</span>
                                  : <span className="text-xs text-text-tertiary">-</span>}
                              </td>
                              {/* 담당자 */}
                              <td className="px-3 py-3 text-xs whitespace-nowrap">
                                {managerName
                                  ? <span className="text-text-primary">{managerName}</span>
                                  : <span className="text-text-tertiary">미배정</span>}
                              </td>
                              {!isWorker && (
                                <>
                                  {/* 결제방법 */}
                                  <td className="px-3 py-3 text-xs text-text-secondary whitespace-nowrap">{c.payment_method ?? '-'}</td>
                                  {/* 총액 (공급가액 + 부가세) */}
                                  <td className="px-3 py-3 text-xs font-mono font-semibold text-text-primary whitespace-nowrap">
                                    {total > 0
                                      ? <>{total.toLocaleString('ko-KR')}<span className="text-text-tertiary font-normal">원</span></>
                                      : <span className="text-text-tertiary">-</span>}
                                  </td>
                                </>
                              )}
                              {/* Phase 27-H: worker에겐 진행상태·결제상태도 숨김 (헤더와 짝 유지) */}
                              {!isWorker && (
                                <>
                                  {/* 진행상태 뱃지 (Phase 9-A) */}
                                  <td className="px-3 py-3 whitespace-nowrap">
                                    {c.progress_status
                                      ? <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">{c.progress_status}</span>
                                      : <span className="text-xs text-text-tertiary">-</span>}
                                  </td>
                                  {/* 결제상태 뱃지 + Phase 11 dot */}
                                  <td className="px-3 py-3 whitespace-nowrap">
                                    {c.payment_status_detail
                                      ? <span className="inline-flex items-center gap-1.5 text-xs px-1.5 py-0.5 rounded-full font-medium bg-teal-50 text-teal-700 border border-teal-200">
                                          <span className={`w-1.5 h-1.5 rounded-full ${PAYMENT_STATUS_DOT[c.payment_status_detail] ?? 'bg-gray-400'}`} />
                                          {c.payment_status_detail === '비과세' ? '비과세 결제' : c.payment_status_detail}
                                        </span>
                                      : <span className="text-xs text-text-tertiary">-</span>}
                                  </td>
                                </>
                              )}
                            </>
                          )
                        }
                        // 정기 뷰 — 기존 컬럼 유지
                        return (
                      <>
                      {/* Phase 6-C: 시공일자 (1회성=next_visit_date, 정기는 next_visit_date=다음 방문일) */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        {c.next_visit_date
                          ? <span className="text-xs font-mono text-text-primary">{fmtDate(c.next_visit_date)}</span>
                          : <span className="text-xs text-text-tertiary">미정</span>}
                      </td>
                      <td className="px-3 py-3 min-w-[160px]">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-semibold text-text-primary">{c.business_name}</p>
                          {isPendingApp && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">신청서</span>
                          )}
                        </div>
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
                        <div className="inline-flex items-center gap-1 flex-wrap">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${tStyle.badge}`}>{type}</span>
                          {/* Phase 19: 정기딥/정기엔드에 결제주기 표시 */}
                          {(type === '정기딥케어' || type === '정기엔드케어') && c.billing_cycle && (
                            <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${
                              c.billing_cycle === '연간'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}>
                              {c.billing_cycle === '연간' ? '연' : '월'}
                            </span>
                          )}
                          {/* Phase 22: 투입주기 뱃지 (자유 텍스트) — 숫자면 "N개월/1회", 아니면 원문 */}
                          {(type === '정기딥케어' || type === '정기엔드케어') && c.injection_cycle_months && (
                            <span className="text-[10px] px-1 py-0.5 rounded font-medium bg-sky-100 text-sky-700">
                              {/^\d+$/.test(String(c.injection_cycle_months))
                                ? `${c.injection_cycle_months}개월/1회`
                                : c.injection_cycle_months}
                            </span>
                          )}
                        </div>
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
                      </>
                        )
                      })()}
                    </tr>
                    </Fragment>
                  )
                })
                })()}
              </tbody>
            </table>
          )}
          {/* Phase 18: 30일 축약 로드 안내 + 더 보기 버튼 */}
          {hiddenCount > 0 && !showAllInFilter && (
            <div className="border-t border-border-subtle bg-surface-sunken/40 px-4 py-3 flex items-center justify-between">
              <span className="text-xs text-text-secondary">
                최근 30일치만 표시 중 · <span className="font-semibold text-text-primary">{hiddenCount}건</span> 더 있음
              </span>
              <button
                onClick={() => setShowAllInFilter(true)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white transition-colors"
              >
                전체 보기 ({filtered.length}건)
              </button>
            </div>
          )}
        </div>
        </>
        )}
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
            {/* Phase 22: 고객 상태 — 유형+등급+호의 통합 섹션 (purple 파스텔) */}
            {/* Phase 23: 헤더 우측에 일시정지/재개 토글 */}
            <div className={`border-2 rounded-xl overflow-hidden ${
              selected?.status === 'paused' ? 'border-gray-300 bg-gray-50' : 'border-purple-200 bg-purple-50/30'
            }`}>
              <div className={`px-3 py-2 border-b flex items-center justify-between gap-2 ${
                selected?.status === 'paused' ? 'bg-gray-100 border-gray-200' : 'bg-purple-100/60 border-purple-200'
              }`}>
                <div className="flex items-center gap-2">
                  <p className={`text-xs font-semibold uppercase tracking-wide ${
                    selected?.status === 'paused' ? 'text-gray-700' : 'text-purple-900'
                  }`}>고객 상태</p>
                  {selected?.status === 'paused' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-600 text-white font-semibold">
                      일시정지 중
                    </span>
                  )}
                </div>
                {!isNew && selected && !isWorker && (
                  selected.status === 'paused' ? (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm('일시정지를 해제하고 재개하시겠습니까?')) return
                        try {
                          const res = await fetch(`/api/admin/customers/${selected.id}/pause`, { method: 'DELETE' })
                          const j = await res.json()
                          if (!res.ok) throw new Error(j?.error ?? '재개 실패')
                          toast.success('재개 완료')
                          setSelected(prev => prev ? { ...prev, status: 'active' } : prev)
                          setCustomers(prev => prev.map(c => c.id === selected.id ? { ...c, status: 'active' } : c))
                        } catch (e) { toast.error(e instanceof Error ? e.message : '재개 실패') }
                      }}
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-md border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50"
                    >
                      ▶ 재개
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm('이 고객을 일시정지하시겠습니까?\n미래 예정된 방문 일정은 삭제되고, 매출·자동 청구·알림에서 제외됩니다.')) return
                        try {
                          const res = await fetch(`/api/admin/customers/${selected.id}/pause`, { method: 'POST' })
                          const j = await res.json()
                          if (!res.ok) throw new Error(j?.error ?? '일시정지 실패')
                          toast.success(`일시정지 완료 (미래 일정 ${j.deleted_future_visits ?? 0}건 삭제)`)
                          setSelected(prev => prev ? { ...prev, status: 'paused' } : prev)
                          setCustomers(prev => prev.map(c => c.id === selected.id ? { ...c, status: 'paused' } : c))
                        } catch (e) { toast.error(e instanceof Error ? e.message : '일시정지 실패') }
                      }}
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                    >
                      ⏸ 일시정지
                    </button>
                  )
                )}
              </div>
              <div className="p-3 space-y-2">
                {/* 유형 */}
                <div className="flex items-start gap-2 flex-wrap">
                  <span className="text-xs text-text-tertiary w-8 shrink-0 pt-1">유형</span>
                  <div className="flex gap-1 flex-wrap">
                    {CUSTOMER_TYPES.map(t => (
                      <button key={t} onClick={() => set('customer_type')(t)}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                          form.customer_type === t
                            ? `${TYPE_STYLE[t].badge} ring-2 ring-offset-1 ring-current`
                            : 'bg-surface-sunken text-text-secondary hover:bg-surface-sunken'
                        }`}>{t}
                      </button>
                    ))}
                  </div>
                </div>
                {/* 등급 + 호의 한 줄 배치 */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-text-tertiary w-8 shrink-0">등급</span>
                    {(['화이트', '블루', '블랙'] as CustomerGrade[]).map(g => (
                      <button key={g} onClick={() => setForm(f => ({ ...f, grade: f.grade === g ? '' : g }))}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                          form.grade === g
                            ? `${GRADE_STYLE[g].badge} ring-2 ring-offset-1 ring-current`
                            : 'bg-surface-sunken text-text-secondary hover:bg-surface-sunken'
                        }`}>{g}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-text-tertiary w-8 shrink-0">성향</span>
                    {(['호의', '보통', '주의'] as CustomerDisposition[]).map(d => (
                      <button key={d} onClick={() => set('disposition')(d)}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                          (form.disposition ?? '보통') === d
                            ? `${DISPOSITION_STYLE[d].badge} ring-2 ring-offset-1 ring-current`
                            : 'bg-surface-sunken text-text-secondary hover:bg-surface-sunken'
                        }`}>{d}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Phase 7-I / Phase 9-C / Phase 17: 1회성·일반일정 공통 계약 정보 — 시공일자 + 진행상태 + 결제상태 */}
            {!isWorker && isOnceCare && (
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
                  <p className="text-xs font-semibold text-text-primary">{form.customer_type === '일반일정' ? '일반일정 정보' : '1회성케어 계약 정보'}</p>
                </div>
                <div className="p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-secondary w-24 shrink-0">시공일자</span>
                    <input
                      type="date"
                      value={form.next_visit_date}
                      onChange={e => set('next_visit_date')(e.target.value)}
                      className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 bg-surface"
                    />
                  </div>
                  {/* Phase 9-C: 진행상태 (자동화: 알림 발송 시 자동 세팅. 수동 편집도 가능) */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-secondary w-24 shrink-0">진행상태</span>
                    <select
                      value={form.progress_status}
                      onChange={e => set('progress_status')(e.target.value)}
                      className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 bg-surface"
                    >
                      <option value="">(미정)</option>
                      {PROGRESS_STATUS_OPTIONS.map(v => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                  {/* Phase 9-C: 결제상태 (비과세는 DB '비과세' 값 유지, 라벨만 '비과세 결제') */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-secondary w-24 shrink-0">결제상태</span>
                    <select
                      value={form.payment_status_detail}
                      onChange={e => set('payment_status_detail')(e.target.value)}
                      className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 bg-surface"
                    >
                      <option value="">(미정)</option>
                      {PAYMENT_STATUS_DETAIL_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <p className="text-[11px] text-text-tertiary break-keep">
                    시공일자를 지정하면 미배정 목록에서 자동으로 빠지고 시공일자 기준 정렬에 반영됩니다. 진행·결제 상태는 알림 발송 시 자동 업데이트되며 수동 편집도 가능합니다.
                  </p>
                </div>
              </div>
            )}
            {isNew && !isWorker && isDipCare && (
              <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
                <p className="text-[11px] text-text-secondary break-keep">
                  📝 아래 &ldquo;정기딥케어 계약 정보&rdquo; 섹션에서 방문 주기·순환·건당 급여·계약 기간을 입력하세요.
                </p>
              </div>
            )}
            {isNew && !isWorker && isEndCare && (
              <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
                <p className="text-[11px] text-text-secondary break-keep">
                  📝 아래 &ldquo;정기엔드케어 계약 정보&rdquo; 섹션에서 결제 주기·청구 금액·계약 기간·작업자 지급 조건을 입력하세요.
                </p>
              </div>
            )}

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

            {/* Phase 21: 일반정보 — 파스텔 amber 배경 + 테두리 */}
            <div className="border-2 border-amber-200 rounded-xl p-3 bg-amber-50/40">
              <p className="text-xs font-semibold text-amber-900 uppercase tracking-wide mb-2">일반정보</p>
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
                  <div className="flex flex-1 gap-1 items-center">
                    <label className="flex items-center gap-1 text-[11px] text-text-tertiary shrink-0 cursor-pointer" title="알림 발송 대상 포함 여부">
                      <input
                        type="checkbox"
                        checked={form.phone_notify_1}
                        onChange={e => setForm(prev => ({ ...prev, phone_notify_1: e.target.checked }))}
                        className="accent-brand-600"
                      />
                      발송
                    </label>
                    <input value={form.contact_phone} onChange={e => set('contact_phone')(e.target.value)}
                      className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <a href={`tel:${form.contact_phone}`} className="px-2 py-1.5 text-xs bg-brand-50 text-brand-600 rounded-lg hover:bg-brand-100"><Phone size={14} /></a>
                    <button onClick={() => navigator.clipboard.writeText(form.contact_phone).then(() => toast.success('연락처 복사됨'))} className="px-2 py-1.5 text-xs bg-surface-sunken rounded-lg hover:bg-surface-sunken"><ClipboardList size={14} /></button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary w-20 shrink-0">추가번호</span>
                  <div className="flex flex-1 gap-1 items-center">
                    <label className="flex items-center gap-1 text-[11px] text-text-tertiary shrink-0 cursor-pointer" title="알림 발송 대상 포함 여부">
                      <input
                        type="checkbox"
                        checked={form.phone_notify_2}
                        onChange={e => setForm(prev => ({ ...prev, phone_notify_2: e.target.checked }))}
                        disabled={!form.contact_phone_2.trim()}
                        className="accent-brand-600 disabled:opacity-40"
                      />
                      발송
                    </label>
                    <input value={form.contact_phone_2} onChange={e => set('contact_phone_2')(e.target.value)}
                      placeholder="알림수신 추가번호 (선택)"
                      className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    {form.contact_phone_2 && (
                      <a href={`tel:${form.contact_phone_2}`} className="px-2 py-1.5 text-xs bg-brand-50 text-brand-600 rounded-lg hover:bg-brand-100"><Phone size={14} /></a>
                    )}
                  </div>
                </div>
                {/* Phase 22: 포털 계정 필드 → 고객 계정 섹션에 통합됨 (자리 제거) */}
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

            {/* Phase 22 v3: 고객 계정 — 포털계정 표시 + (정기케어) 계정 통합 UI 통합 */}
            {!isNew && selected && !isWorker && (
              <CustomerAccountLink
                customerId={selected.id}
                accountUserId={selected.account_user_id}
                ownerAccountLabel={(() => {
                  if (!selected.user_id) return null
                  const owner = usersList.find(u => u.id === selected.user_id)
                  if (!owner) return null
                  const phone = owner.phone ?? ''
                  const formattedPhone = phone.length === 11
                    ? `${phone.slice(0, 3)}-${phone.slice(3, 7)}-${phone.slice(7)}`
                    : phone
                  return formattedPhone ? `${owner.name} · ${formattedPhone}` : owner.name
                })()}
                linkedLabel={(() => {
                  if (!selected.account_user_id) return null
                  const target = customers.find(c => c.user_id === selected.account_user_id)
                  if (!target) return null
                  return target.customer_type
                    ? `${target.business_name} (${target.customer_type})`
                    : target.business_name
                })()}
                showMerger={isRegular}
                onUpdated={(next) => setSelected(prev => prev ? { ...prev, account_user_id: next } : prev)}
              />
            )}

            {/* Phase 22: 작업장정보 — 헤더를 테두리 안으로 이동, teal 파스텔로 시공정보(green)와 구분 */}
            <div className="border-2 border-teal-200 rounded-xl overflow-hidden bg-teal-50/30">
              <div className="bg-teal-100/60 px-3 py-2 border-b border-teal-200">
                <p className="text-xs font-semibold text-teal-900 uppercase tracking-wide">작업장정보</p>
              </div>
              <div className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary w-20 shrink-0">주차</span>
                  <input value={form.parking_info} onChange={e => set('parking_info')(e.target.value)}
                    className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary w-20 shrink-0">건물출입</span>
                  <input value={form.building_access} onChange={e => set('building_access')(e.target.value)}
                    className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary w-20 shrink-0">엘리베이터</span>
                  <input value={form.elevator} onChange={e => set('elevator')(e.target.value)}
                    className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary w-20 shrink-0">출입방법</span>
                  <input value={form.access_method} onChange={e => set('access_method')(e.target.value)}
                    className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
              </div>
            </div>

            {/* Phase 22: 시공정보 — 헤더를 테두리 안으로 + 케어매뉴얼 편집 버튼 헤더 옆으로 이동 */}
            <div className="border-2 border-green-200 rounded-xl overflow-hidden bg-green-50/30">
              <div className="bg-green-100/60 px-3 py-2 border-b border-green-200 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-green-900 uppercase tracking-wide">시공정보</p>
                {!isNew && selected && isRegular && (
                  <button
                    type="button"
                    onClick={() => { window.location.href = `/admin/customers/${selected.id}/care-manual` }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white text-[11px] font-semibold shadow-sm hover:shadow-md transition-all"
                  >
                    <BookOpen size={11} />
                    {isWorker ? '매뉴얼 보기' : '매뉴얼 편집'}
                  </button>
                )}
              </div>
              <div className="p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-xs text-text-secondary w-20 shrink-0 pt-1.5">케어범위</span>
                  <textarea value={form.care_scope} onChange={e => set('care_scope')(e.target.value)} rows={isDipCare ? 6 : 3}
                    placeholder={isDipCare
                      ? "예)\n- 1월: 후드 · 그리스트랩\n- 2월: 덕트 · 바닥 왁싱\n- 3월: 식기세척기\n- 분기 1회 / 월 3회 등 자유 서술"
                      : "예) - 후드청소&#10;- 덕트청소&#10;- 계단청소"}
                    className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 resize-none text-text-primary" />
                </div>
                {/* Phase 22: 투입주기 — 자유 텍스트 (숫자·격주·매월 등 모두 허용) */}
                {(isDipCare || isEndCare) && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-secondary w-20 shrink-0 inline-flex items-center gap-1">
                      투입주기
                      <FieldHint text="몇 개월마다 한 번씩 방문하는지 (자유 텍스트). 예: 3개월/1회, 격주, 매월 2회. 청구·발행 로직에는 영향 없음, 관리 참고용." />
                    </span>
                    <input
                      type="text"
                      value={form.injection_cycle_months}
                      onChange={e => set('injection_cycle_months')(e.target.value)}
                      placeholder="예: 3개월/1회, 격주, 매월 2회"
                      className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 text-text-primary" />
                  </div>
                )}
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
                {/* Phase A-5: 시공시간 (주로 1회성케어) */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary w-20 shrink-0">시공시간</span>
                  <input type="time" value={form.construction_time} onChange={e => set('construction_time')(e.target.value)}
                    className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                {/* Phase 22: 케어매뉴얼 편집 → 시공정보 헤더 옆으로 이동됨 (자리 제거) */}
                {/* Phase 22: 고객계정통합 → 일반정보 섹션 아래로 이동됨 (자리 제거) */}
              </div>
            </div>

            {/* Phase 22: 결제정보 — rose 파스텔 테두리+배경 신설, 헤더 박스 안으로 (worker 숨김) */}
            {!isWorker && (
            <div className="border-2 border-rose-200 rounded-xl overflow-hidden bg-rose-50/30">
              <div className="bg-rose-100/60 px-3 py-2 border-b border-rose-200">
                <p className="text-xs font-semibold text-rose-900 uppercase tracking-wide">결제정보</p>
              </div>
              <div className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary w-20 shrink-0 inline-flex items-center gap-1">
                    결제방법
                    <FieldHint text="비과세 계열(현금(비과세)·카드 간편결제·플랫폼)이면 부가세 자동 0원 처리 + 세금계산서 발행 대기에서도 제외." />
                  </span>
                  <select value={form.payment_method} onChange={e => set('payment_method')(e.target.value)}
                    className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-rose-500 bg-surface">
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
                      className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono" />
                    <button onClick={() => navigator.clipboard.writeText(form.account_number).then(() => toast.success('계좌번호 복사됨'))} className="px-2 py-1.5 text-xs bg-surface-sunken rounded-lg hover:bg-surface-sunken"><ClipboardList size={14} /></button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary w-20 shrink-0">사업자번호</span>
                  <div className="flex flex-1 gap-1">
                    <input value={form.business_number} onChange={e => set('business_number')(e.target.value)}
                      className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono" />
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

            {/* ── 포트원 결제 — 1회성케어 + 카드 간편결제 (Phase A-4 이관) ── */}
            {!isWorker && isOnceCare && form.payment_method === '카드(온라인 간편결제)' && selected && !isNew && (
              <div className="rounded-xl border border-brand-200 overflow-hidden">
                <div className="bg-brand-50 px-4 py-2.5 border-b border-brand-200">
                  <p className="text-xs font-semibold text-brand-800">포트원 결제</p>
                </div>
                <div className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-secondary w-20 shrink-0">예약금</span>
                    <div className="flex flex-1 gap-1">
                      {selected.deposit_paid_at ? (
                        <div className="flex-1 border border-border-subtle rounded-lg px-2 py-1.5 text-xs text-state-success bg-state-success-bg">✅ 예약금 결제완료</div>
                      ) : selected.deposit_payment_url ? (
                        <>
                          <button
                            onClick={() => { navigator.clipboard.writeText(selected.deposit_payment_url!); toast.success('예약금 결제링크 복사됨') }}
                            className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs font-mono text-text-secondary text-left truncate hover:bg-surface-sunken"
                          >
                            {selected.deposit_payment_url.split('/').slice(-1)[0]?.slice(0, 24)}…
                          </button>
                          <button onClick={() => handleSendPaymentLink('deposit')} disabled={sendingPaymentLink} className="px-2 py-1.5 text-xs bg-surface-sunken rounded-lg hover:bg-border border border-border-subtle" title="링크 재생성">
                            <ClipboardList size={14} />
                          </button>
                        </>
                      ) : (
                        <Button onClick={() => handleSendPaymentLink('deposit')} disabled={sendingPaymentLink || !form.deposit} className="flex-1 bg-brand-600 hover:bg-brand-700 text-white text-xs">
                          {sendingPaymentLink ? '생성 중...' : '예약금 링크 생성 · 복사'}
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-secondary w-20 shrink-0">잔금</span>
                    <div className="flex flex-1 gap-1">
                      {selected.balance_paid_at ? (
                        <div className="flex-1 border border-border-subtle rounded-lg px-2 py-1.5 text-xs text-state-success bg-state-success-bg">✅ 잔금 결제완료</div>
                      ) : selected.billing_key ? (
                        <Button onClick={handleChargeBalance} disabled={chargingBalance} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs">
                          {chargingBalance ? '청구 중...' : '잔금 자동 청구'}
                        </Button>
                      ) : (
                        <div className="flex-1 border border-border-subtle rounded-lg px-2 py-1.5 text-xs text-text-tertiary bg-surface-sunken">예약금 결제 후 활성화</div>
                      )}
                    </div>
                  </div>
                  {selected.billing_key && !selected.balance_paid_at && (
                    <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <p className="text-xs text-emerald-700">카드 등록됨 · 잔금 즉시 청구 가능</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Phase 7-I: 1회성 시공일자 섹션은 폼 최상단(유형 선택 아래)으로 이동됨 — 여기 자리는 제거 */}

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
                      <span className="text-xs text-text-secondary w-24 shrink-0 inline-flex items-center gap-1">
                        결제 주기
                        <FieldHint text="정기엔드케어는 구독형 서비스. 월간=매월 결제일자에 청구 도래. 연간=계약 시 1건 일괄 발행." />
                      </span>
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
                    {/* Phase 22 v9: 정기엔드 결제 이력 인라인 드롭다운 — billing_cycle에 따라 월간/연간 이력 표시 */}
                    {form.billing_cycle && !isNew && selected && (
                      <>
                        <button
                          type="button"
                          onClick={() => setShowInlineEndCareHistory(v => !v)}
                          className="w-full py-1 text-[11px] text-purple-700 font-semibold rounded-md border border-purple-200 bg-white hover:bg-purple-100 flex items-center justify-center gap-1"
                        >
                          {showInlineEndCareHistory
                            ? `${form.billing_cycle} 결제 이력 접기 ▲`
                            : `${form.billing_cycle} 결제 이력 보기 ▼`}
                        </button>
                        {showInlineEndCareHistory && (
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
                      </>
                    )}
                  </div>

                  {/* 계약기간 */}
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold text-text-primary inline-flex items-center gap-1">
                      계약기간
                      <FieldHint text="계약 시작·만료일. 저장 시 이 기간 내 매월(또는 매년) 청구 예정 레코드가 자동 생성됨. 세금계산서 발행 후보는 이 예정 리스트에서 자동 추출." />
                    </p>
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
                      <span className="text-xs text-text-secondary w-24 shrink-0 inline-flex items-center gap-1">
                        결제일자
                        <FieldHint text="매월 청구가 도래하는 날짜 (1~31). 세금계산서 발행 후보 리스트는 이 날짜가 지난 청구건을 자동 감지." />
                      </span>
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

                  {/* Phase 5-E: 계약일정 저장·생성 버튼 — 둘 다 기간 모달 오픈 */}
                  {!isNew && selected && (
                    <div className="flex justify-end gap-1.5 mt-1">
                      <button onClick={() => { setCheckedIds([selected.id]); openScheduleGenModal('cleanup') }} disabled={saving}
                        className="px-3 py-1.5 text-xs font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50">
                        저장
                      </button>
                      <button onClick={() => { setCheckedIds([selected.id]); openScheduleGenModal('create') }} disabled={saving}
                        className="px-3 py-1.5 text-xs font-medium bg-white hover:bg-purple-50 text-purple-700 border border-purple-300 rounded-lg transition-colors disabled:opacity-50">
                        생성
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── 정기딥케어 계약 — worker 숨김 ── */}
            {!isWorker && isDipCare && (
              <div className="rounded-xl border border-blue-200 overflow-hidden">
                <div className="bg-blue-50 px-4 py-2.5 border-b border-blue-200">
                  <p className="text-xs font-semibold text-blue-800">정기딥케어 계약 정보</p>
                </div>
                <div className="p-3 flex flex-col gap-3">
                  {/* Phase 21: 결제 소섹션 — 컴팩트 + 파스텔 blue */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex flex-col gap-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-secondary w-20 shrink-0 inline-flex items-center gap-1">
                        결제 주기
                        <FieldHint text="정기딥은 방문 기반 청구. 월간=그 달 첫 방문 완료 시 세금계산서 발행 후보 도래. 연간=계약 저장 시 1건 일괄 발행 (선결제)." />
                      </span>
                      <div className="flex gap-1 flex-1">
                        {(['월간', '연간'] as BillingCycle[]).map(c => (
                          <button key={c} onClick={() => set('billing_cycle')(c)}
                            className={`flex-1 py-1 text-xs rounded-md font-medium transition-colors ${
                              form.billing_cycle === c ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-blue-100 hover:bg-blue-100'
                            }`}>{c}</button>
                        ))}
                      </div>
                    </div>
                    {/* Phase 22 v2: 연간 선결제 안내 멘트 삭제 → 대신 연간 이력 인라인 드롭다운 (컴포넌트 렌더는 아래 총액 아래에서) */}
                    {isNoVatMethod(form.payment_method) && (
                      <div className="px-2 py-1.5 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-700 font-semibold flex items-center gap-1">
                        <Banknote size={12} /> 현금 결제 — 부가세 미적용
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-1.5 items-end">
                      <div>
                        <label className="text-[10px] text-text-secondary block inline-flex items-center gap-1">
                          공급가액 <span className="text-text-tertiary">({form.billing_cycle === '연간' ? '연' : '월'})</span>
                          <FieldHint text="부가세 제외 금액. 자동 청구 생성 시 부가세 포함(supply+vat) 금액이 청구 amount로 사용됨." />
                        </label>
                        <input type="number" value={form.supply_amount} onChange={e => set('supply_amount')(e.target.value)}
                          placeholder="0"
                          className="w-full border border-border rounded-md px-1.5 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="text-[10px] text-text-secondary block">부가세 <span className="text-text-tertiary">{isNoVatMethod(form.payment_method) ? '(X)' : '(10%)'}</span></label>
                        <input type="number"
                          value={isNoVatMethod(form.payment_method) ? '0' : form.vat}
                          onChange={e => set('vat')(e.target.value)}
                          disabled={isNoVatMethod(form.payment_method)}
                          placeholder="0"
                          className="w-full border border-border rounded-md px-1.5 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-surface-sunken disabled:text-text-tertiary" />
                      </div>
                      <div>
                        <label className="text-[10px] text-text-secondary block">총액</label>
                        <div className="w-full px-1.5 py-1 text-xs font-bold text-text-primary bg-white border border-border rounded-md text-right">
                          {((Number(form.supply_amount) || 0) + (isNoVatMethod(form.payment_method) ? 0 : (Number(form.vat) || 0))).toLocaleString('ko-KR')}
                        </div>
                      </div>
                    </div>
                    {form.billing_cycle === '연간' && form.supply_amount && (
                      <p className="text-[11px] text-blue-700 bg-blue-100 rounded px-2 py-1">
                        월 환산 {Math.round(((Number(form.supply_amount) || 0) + (isNoVatMethod(form.payment_method) ? 0 : (Number(form.vat) || 0))) / 12).toLocaleString('ko-KR')}원
                      </p>
                    )}
                    {/* Phase 22 v2: 연간 결제 이력 인라인 드롭다운 — 연간 & 저장된 고객일 때 노출 */}
                    {form.billing_cycle === '연간' && !isNew && selected && (
                      <>
                        <button
                          type="button"
                          onClick={() => setShowInlineAnnualHistory(v => !v)}
                          className="w-full py-1 text-[11px] text-blue-700 font-semibold rounded-md border border-blue-200 bg-white hover:bg-blue-100 flex items-center justify-center gap-1"
                        >
                          {showInlineAnnualHistory ? '연간 결제 이력 접기 ▲' : '연간 결제 이력 보기 ▼'}
                        </button>
                        {showInlineAnnualHistory && (
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
                      </>
                    )}
                  </div>

                  {/* Phase 21: 계약기간 소섹션 — 한 줄 + 파스텔 sky */}
                  <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 flex items-center gap-2">
                    <p className="text-xs font-semibold text-text-primary shrink-0">
                      계약기간 <span className="text-text-tertiary font-normal">(시작 · 만료)</span>
                    </p>
                    <input type="date" value={form.contract_start_date} onChange={e => set('contract_start_date')(e.target.value)}
                      className="flex-1 border border-border rounded-md px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-sky-500" />
                    <span className="text-text-tertiary text-xs">-</span>
                    <input type="date" value={form.contract_end_date} onChange={e => set('contract_end_date')(e.target.value)}
                      className="flex-1 border border-border rounded-md px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-sky-500" />
                  </div>

                  {/* Phase 21: 방문 일정 소섹션 — 파스텔 indigo */}
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 flex flex-col gap-2">
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

                  {/* Phase 5-E: 계약일정 저장·생성 버튼 — 둘 다 기간 모달 오픈 */}
                  {!isNew && selected && (
                    <div className="flex justify-end gap-1.5 mt-1">
                      <button onClick={() => { setCheckedIds([selected.id]); openScheduleGenModal('cleanup') }} disabled={saving}
                        className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
                        저장
                      </button>
                      <button onClick={() => { setCheckedIds([selected.id]); openScheduleGenModal('create') }} disabled={saving}
                        className="px-3 py-1.5 text-xs font-medium bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 rounded-lg transition-colors disabled:opacity-50">
                        생성
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Phase 22: D-day 요약 → 저장 버튼 아래로 이관됨 (자리 제거) */}

            {/* Phase 22 v6: 결제 상태 요약 — 이번달 일정 위에 미해결 결제/계산서 이슈 컴팩트 노출
                Phase 27-I: worker에겐 완전 블라인드 */}
            {!isWorker && selected && !isNew && (form.customer_type === '정기딥케어' || form.customer_type === '정기엔드케어') && (
              <PaymentIssuesSummary
                customerId={selected.id}
                phone={form.contact_phone}
                businessName={form.business_name}
                paymentMethod={form.payment_method || null}
                customerType={form.customer_type}
              />
            )}

            {/* Phase 2: 이번달 일정 (정기딥/엔드 고객만 노출, 저장 버튼 바로 위)
                Phase 27: 캘린더에서 진입 시 focus된 회차 아코디언 자동 확장 + 해당 월로 이동
                Phase 27-I: worker에겐 완전 블라인드 */}
            {!isWorker && selected && !isNew && (form.customer_type === '정기딥케어' || form.customer_type === '정기엔드케어') && (
              <MonthlyScheduleSection
                customerId={selected.id}
                businessName={form.business_name}
                phone={form.contact_phone}
                users={usersList.filter(u => u.role === 'admin' || u.role === 'worker')}
                workers={flexibleWorkers}
                initialMonth={calendarFocus?.month}
                focusApplicationId={calendarFocus?.appId}
              />
            )}

            {/* 저장 버튼 — worker는 읽기 전용 */}
            {!isWorker && (
              <Button onClick={handleSave} disabled={saving} size="lg" className="w-full">
                {saving ? '저장 중...' : isNew ? '✚ 고객 추가' : <><Save size={14} /> 저장</>}
              </Button>
            )}
            {/* Phase 5-G: 이력탭 모드에서 개별 되돌리기 */}
            {!isWorker && !isNew && selected && archivedView && (
              <Button onClick={handleUnarchiveSingle} size="lg"
                className="w-full mt-2 bg-sky-600 hover:bg-sky-700 text-white">
                ↩ 고객관리로 되돌리기
              </Button>
            )}
            {isWorker && (
              <div className="w-full py-2.5 bg-surface-sunken text-text-secondary text-sm font-semibold rounded-lg text-center">
                읽기 전용 (수정 권한 없음)
              </div>
            )}

            {/* Phase 22: D-day 요약 (정기케어) — 저장 버튼 아래로 이관 */}
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

            {/* Phase 22 v10: 청구 요약 완전 제거 — 정기딥/정기엔드 모두 계약정보 인라인 이력 + 상단 PaymentIssuesSummary가 대체 */}

            {/* Phase 22 v9: 청구 이력 — 정기딥/정기엔드 모두 계약정보 인라인 이력이 대체하므로 하단 렌더 제거됨 */}

            {/* 알림 발송 (1회성 + 정기 모두, 관리자만) — Phase A-3 이관 */}
            {/* Phase 27-AA: 로딩 중에도 패널 노출 (DB 로딩 지연 시 순간 사라짐 방지).
                notifyOptions.length===0 && !notifyLoading = "DB에 해당 유형 템플릿 없음"
                → 문자알림관리 탭에서 등록 유도 안내를 대신 표시. */}
            {!isWorker && !isNew && selected && (notifyLoading || notifyOptions.length > 0 || (form.customer_type && !notifyLoading && dbNotifyCodes[form.customer_type]?.length === 0)) && (
              <div className="border border-border-subtle rounded-xl overflow-hidden">
                <p className="text-xs font-semibold text-text-secondary px-4 py-2.5 bg-surface-sunken border-b border-border-subtle">고객 알림 발송</p>
                <div className="p-4 space-y-3">
                  <div className="flex gap-2">
                    <select value={notifyType} onChange={e => setNotifyType(e.target.value)}
                      disabled={notifyLoading || notifyOptions.length === 0}
                      className="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-surface disabled:bg-surface-sunken disabled:text-text-tertiary">
                      <option value="">
                        {notifyLoading
                          ? '알림 목록 불러오는 중...'
                          : notifyOptions.length === 0
                            ? '이 유형에 등록된 알림 없음 (문자알림관리 탭에서 추가)'
                            : '알림 유형 선택...'}
                      </option>
                      {notifyOptions.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <Button onClick={handleNotify} disabled={sending || !notifyType || notifyLoading} className="bg-orange-500 hover:bg-orange-600 text-white whitespace-nowrap">
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
                      {notifyType === '방문견적알림' && selected.next_visit_date && (
                        <p className="text-orange-500">시공일자: {fmtDate(selected.next_visit_date)} · 방문시간: {selected.construction_time ?? selected.business_hours_start ?? '-'}</p>
                      )}
                    </div>
                  )}
                  {/* 발송 이력 */}
                  <div className="border border-border-subtle rounded-lg overflow-hidden">
                    <p className="text-xs font-semibold text-text-secondary px-3 py-2 bg-surface-sunken border-b border-border-subtle">발송 이력</p>
                    {notifyLogs.length === 0 ? (
                      <p className="text-xs text-text-tertiary text-center py-4">발송 이력이 없습니다.</p>
                    ) : (
                      <div className="max-h-52 overflow-y-auto divide-y divide-border-subtle">
                        {notifyLogs.map((log, i) => {
                          const isResent = log.type.startsWith('[재발송] ')
                          const baseType = isResent ? log.type.replace('[재발송] ', '') : log.type
                          const cfg = NOTIFY_TYPE_CONFIG[baseType]
                          return (
                            <div key={i} className="flex items-center justify-between px-3 py-2 gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {isResent && (
                                  <span className="text-xs px-1.5 py-0.5 bg-surface-sunken text-text-secondary rounded font-medium shrink-0">재발송</span>
                                )}
                                {log.method === 'auto' && (
                                  <span className="text-xs px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded font-medium shrink-0">[자동]</span>
                                )}
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg?.badge ?? 'bg-surface-sunken text-text-secondary'}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${cfg?.dot ?? 'bg-text-tertiary'} shrink-0`} />
                                  <span className="truncate">{baseType}</span>
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs text-text-tertiary">{new Date(log.sentAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                                {!isResent && (
                                  <button
                                    onClick={() => handleResend(baseType)}
                                    disabled={sending}
                                    className="text-xs px-2 py-0.5 bg-orange-50 text-orange-600 hover:bg-orange-100 rounded transition-colors disabled:opacity-50 whitespace-nowrap"
                                  >
                                    재발송
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
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
          <h2 className="text-lg font-bold text-text-primary mb-1">
            {scheduleGenModal.mode === 'cleanup' ? '계약일정 저장 (기존 일정 갈아엎기)' : '서비스 일정 생성 (신규)'}
          </h2>
          <p className="text-xs text-text-tertiary mb-4 break-keep">
            {scheduleGenModal.mode === 'cleanup'
              ? `선택한 ${checkedIds.length}개 고객의 기간 내 기존 미완료 일정을 삭제하고, 새 방문일정으로 재생성합니다. (완료된 이력은 보존)`
              : `선택한 ${checkedIds.length}개 고객의 방문 주기대로 기간 내 일정을 신규 생성합니다. (기존 있는 날짜는 유지)`}
          </p>

          <div className="grid grid-cols-2 gap-2 mb-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-text-secondary">시작일</span>
              <input
                type="date"
                value={scheduleGenModal.startDate}
                onChange={(e) => setScheduleGenModal((s) => ({ ...s, startDate: e.target.value }))}
                className="px-3 py-2 border border-border rounded-md text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-text-secondary">종료일</span>
              <input
                type="date"
                value={scheduleGenModal.endDate}
                onChange={(e) => setScheduleGenModal((s) => ({ ...s, endDate: e.target.value }))}
                className="px-3 py-2 border border-border rounded-md text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </label>
          </div>

          <p className="text-[11px] text-text-tertiary bg-surface-sunken rounded-md px-3 py-2 mb-4 break-keep">
            💡 <strong>{scheduleGenModal.startDate} ~ {scheduleGenModal.endDate}</strong> 기간의
            {scheduleGenModal.mode === 'cleanup'
              ? ' 기존 미완료 일정을 모두 삭제하고 새 방문 주기(요일/월간 날짜)대로 재생성합니다.'
              : ' 방문 주기(요일/월간 날짜) 패턴대로 신규 일정을 만듭니다.'}
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
              onClick={() => handleGenerateSchedulesBulk(scheduleGenModal.startDate, scheduleGenModal.endDate, scheduleGenModal.mode)}
              disabled={scheduleGenModal.submitting}
              className={`px-4 py-2 text-white text-sm font-semibold rounded-lg disabled:opacity-50 ${
                scheduleGenModal.mode === 'cleanup'
                  ? 'bg-purple-600 hover:bg-purple-700'
                  : 'bg-brand-600 hover:bg-brand-700'
              }`}
            >
              {scheduleGenModal.submitting
                ? '처리 중...'
                : scheduleGenModal.mode === 'cleanup' ? '저장' : '생성'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
