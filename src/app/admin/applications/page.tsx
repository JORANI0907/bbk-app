'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  type DriveFolder,
  loadGoogleAPIs,
  requestGoogleToken,
  openFolderPicker,
  resolveFolder,
  saveDriveFolderCookie,
  getSavedDriveFolder as getDriveFolderCookie,
  createWorkFolderStructure,
} from '@/lib/googleDrive'
import { useModalBackButton } from '@/hooks/useModalBackButton'
import { MonthNavigator } from '@/components/MonthNavigator'
import { LoadingSpinner } from '@/components/admin/LoadingSpinner'
import { MapSelectorModal } from '@/components/MapSelectorModal'
import { ShoppingItemsSection } from '@/components/admin/ShoppingItemsSection'
import { getScheduleToday } from '@/lib/schedule-today'
import { Button } from '@/components/ui'
import { Phone, ClipboardList, Map as MapIcon, Folder, FolderOpen, FileText, PenLine, Link, Save, Megaphone, AlertTriangle, Banknote, Camera } from 'lucide-react'
import { TimePicker24h } from '@/components/admin/TimePicker24h'

type ServiceType = '1회성케어' | '정기딥케어' | '정기엔드케어'
type ApplicationStatus = '신규' | '견적발송' | '예약확정' | '예약1일전' | '예약당일' | '작업완료' | '작업완료(엔드)' | '결제' | '결제완료' | '결제완료(잔금)' | '계산서발행완료' | '비과세' | '카드결제 완료' | '예약금환급완료' | '예약금 입금' | '예약취소' | 'A/S방문' | '방문견적'

interface User { id: string; name: string; role: string }
interface Worker { id: string; name: string; employment_type: string | null; phone: string | null; account_number: string | null }
interface WorkAssignment { id: string; worker_id: string; construction_date: string | null; business_name: string | null; salary: number | null }
interface Application {
  id: string
  created_at: string
  submitted_at: string | null
  owner_name: string
  platform_nickname: string | null
  phone: string
  email: string | null
  business_name: string
  business_number: string | null
  address: string
  business_hours_start: string | null
  business_hours_end: string | null
  elevator: string | null
  building_access: string | null
  access_method: string | null
  parking: string | null
  payment_method: string | null
  account_number: string | null
  request_notes: string | null
  admin_request_notes: string | null
  status: ApplicationStatus
  admin_notes: string | null
  notion_page_id: string | null
  service_type: ServiceType | null
  assigned_to: string | null
  deposit: number | null
  supply_amount: number | null
  vat: number | null
  balance: number | null
  drive_folder_url: string | null
  construction_date: string | null
  construction_time: string | null
  care_scope: string | null
  unit_price_per_visit: number | null
  pre_meeting_at: string | null
  disposition: string | null
  notification_log?: Array<{ type: string; sent_at: string; method?: 'auto' | 'manual' }> | null
  last_quote_no: string | null
  last_quote_pdf_url: string | null
}

interface NotifyLog { type: string; sentAt: string; method?: 'auto' | 'manual' }

type SortField = 'construction_date' | 'created_at' | 'business_name' | 'owner_name' | 'payment_method' | 'status' | 'total_amount'
type SortDir = 'asc' | 'desc'

// ─── 상수 ────────────────────────────────────────────────────
const SERVICE_TYPES: ServiceType[] = ['1회성케어', '정기딥케어', '정기엔드케어']
const STATUS_CONFIG: Record<ApplicationStatus, { color: string; badge: string; dot: string; row: string }> = {
  '신규':          { color: 'bg-brand-500 text-white',    badge: 'bg-brand-100 text-brand-700 ring-brand-300',   dot: 'bg-brand-500',  row: 'bg-brand-50' },
  '견적발송':      { color: 'bg-indigo-500 text-white',   badge: 'bg-indigo-100 text-indigo-700 ring-indigo-300', dot: 'bg-indigo-500', row: 'bg-indigo-50' },
  '예약확정':      { color: 'bg-green-600 text-white',    badge: 'bg-green-100 text-green-800 ring-green-300',    dot: 'bg-green-600',  row: 'bg-green-50' },
  '예약1일전':     { color: 'bg-brand-500 text-white',    badge: 'bg-brand-100 text-brand-700 ring-brand-300',   dot: 'bg-brand-500',  row: 'bg-brand-50' },
  '예약당일':      { color: 'bg-brand-600 text-white',    badge: 'bg-brand-100 text-brand-800 ring-brand-300',   dot: 'bg-brand-600',  row: 'bg-sky-50' },
  '작업완료':      { color: 'bg-orange-500 text-white',   badge: 'bg-orange-100 text-orange-700 ring-orange-300', dot: 'bg-orange-500', row: 'bg-orange-50' },
  '작업완료(엔드)': { color: 'bg-orange-600 text-white', badge: 'bg-orange-100 text-orange-800 ring-orange-300', dot: 'bg-orange-600', row: 'bg-orange-50' },
  '결제':          { color: 'bg-orange-400 text-white',   badge: 'bg-orange-100 text-orange-600 ring-orange-200', dot: 'bg-orange-400', row: 'bg-amber-50' },
  '결제완료':       { color: 'bg-gray-500 text-white',     badge: 'bg-surface-sunken text-text-secondary ring-gray-300',        dot: 'bg-gray-500',   row: 'bg-surface-sunken' },
  '결제완료(잔금)': { color: 'bg-emerald-600 text-white', badge: 'bg-emerald-100 text-emerald-700 ring-emerald-300', dot: 'bg-emerald-600', row: 'bg-emerald-50' },
  '계산서발행완료': { color: 'bg-gray-300 text-gray-700', badge: 'bg-surface-sunken text-text-tertiary ring-gray-200',         dot: 'bg-gray-300',   row: 'bg-surface' },
  '비과세':         { color: 'bg-gray-300 text-gray-700', badge: 'bg-surface-sunken text-text-tertiary ring-gray-200',         dot: 'bg-gray-300',   row: 'bg-surface' },
  '카드결제 완료':  { color: 'bg-gray-300 text-gray-700', badge: 'bg-surface-sunken text-text-tertiary ring-gray-200',         dot: 'bg-gray-300',   row: 'bg-surface' },
  '예약금환급완료': { color: 'bg-gray-300 text-gray-700', badge: 'bg-surface-sunken text-text-tertiary ring-gray-200',       dot: 'bg-gray-300',   row: 'bg-surface' },
  '예약금 입금':   { color: 'bg-teal-600 text-white',    badge: 'bg-teal-100 text-teal-700 ring-teal-300',      dot: 'bg-teal-600',   row: 'bg-teal-50' },
  '예약취소':      { color: 'bg-gray-400 text-white',     badge: 'bg-surface-sunken text-text-secondary ring-gray-300',      dot: 'bg-gray-400',   row: 'bg-surface-sunken' },
  'A/S방문':       { color: 'bg-gray-400 text-white',     badge: 'bg-surface-sunken text-text-secondary ring-gray-300',      dot: 'bg-gray-400',   row: 'bg-surface-sunken' },
  '방문견적':      { color: 'bg-gray-400 text-white',     badge: 'bg-surface-sunken text-text-secondary ring-gray-300',      dot: 'bg-gray-400',   row: 'bg-surface-sunken' },
}
const NOTIFICATION_TYPES = [
  '예약확정알림', '예약1일전알림', '예약당일알림',
  '작업완료알림', '작업완료알림(현금)', '작업완료알림(카드,플렛폼)',
  '결제알림', '결제알림(현금)', '결제알림(카드,플렛폼)',
  '결제완료알림', '결제완료알림(잔금)', '계산서발행완료알림',
  '예약금 입금완료 알림', '예약금환급완료알림',
  '예약취소알림', 'A/S방문알림', '방문견적알림',
  '작업자 일정 안내', '작업자 자세한 일정 안내', '구독권유알림',
]
const NOTIFY_TYPE_CONFIG: Record<string, { badge: string; dot: string }> = {
  '예약확정알림':       { badge: 'bg-brand-100 text-brand-700',    dot: 'bg-brand-500' },
  '예약1일전알림':      { badge: 'bg-sky-100 text-sky-700',        dot: 'bg-sky-400' },
  '예약당일알림':       { badge: 'bg-violet-100 text-violet-700',  dot: 'bg-violet-500' },
  '작업완료알림':           { badge: 'bg-green-100 text-green-700',    dot: 'bg-green-500' },
  '작업완료알림(현금)':     { badge: 'bg-green-100 text-green-800',    dot: 'bg-green-600' },
  '작업완료알림(카드,플렛폼)': { badge: 'bg-lime-100 text-lime-700',   dot: 'bg-lime-500' },
  '결제알림':               { badge: 'bg-orange-100 text-orange-700',  dot: 'bg-orange-500' },
  '결제알림(현금)':         { badge: 'bg-orange-100 text-orange-800',  dot: 'bg-orange-600' },
  '결제알림(카드,플렛폼)':  { badge: 'bg-amber-100 text-amber-700',    dot: 'bg-amber-500' },
  '결제완료알림':       { badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  '결제완료알림(잔금)': { badge: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-600' },
  '계산서발행완료알림': { badge: 'bg-teal-100 text-teal-700',      dot: 'bg-teal-500' },
  '예약금환급완료알림':  { badge: 'bg-cyan-100 text-cyan-700',      dot: 'bg-cyan-500' },
  '예약금 입금완료 알림': { badge: 'bg-teal-100 text-teal-700',   dot: 'bg-teal-500' },
  '예약취소알림':       { badge: 'bg-red-100 text-red-700',        dot: 'bg-red-500' },
  'A/S방문알림':        { badge: 'bg-yellow-100 text-yellow-700',  dot: 'bg-yellow-500' },
  '방문견적알림':       { badge: 'bg-indigo-100 text-indigo-700',  dot: 'bg-indigo-500' },
  '작업자 일정 안내':        { badge: 'bg-slate-100 text-slate-700',  dot: 'bg-slate-500' },
  '작업자 자세한 일정 안내': { badge: 'bg-slate-200 text-slate-800',  dot: 'bg-slate-600' },
  '구독권유알림':      { badge: 'bg-pink-100 text-pink-700',       dot: 'bg-pink-500' },
  '계정안내알림':      { badge: 'bg-purple-100 text-purple-700',   dot: 'bg-purple-500' },
  '앱설치안내알림':    { badge: 'bg-fuchsia-100 text-fuchsia-700', dot: 'bg-fuchsia-500' },
}
const SORT_LABELS: Record<SortField, string> = {
  construction_date: '시공일자',
  created_at: '신청일',
  business_name: '업체명',
  owner_name: '대표자',
  payment_method: '결제방법',
  status: '계약상태',
  total_amount: '총액',
}

// ─── 알림 이력 헬퍼 ─────────────────────────────────────────
function dbLogToNotifyLog(l: { type: string; sent_at: string; method?: 'auto' | 'manual' }): NotifyLog {
  return { type: l.type, sentAt: l.sent_at, method: l.method ?? 'auto' }
}

// ─── 헬퍼 ────────────────────────────────────────────────────
const fmt = (n: number | null | undefined) => (n == null ? '0' : n.toLocaleString('ko-KR'))
const copyText = (text: string, label: string) =>
  navigator.clipboard.writeText(text).then(() => toast.success(`${label} 복사됨`))
const today = () => new Date().toISOString().slice(0, 10)
const fmtDate = (d: string | null) => d ? d.slice(0, 10).replace(/-/g, '.') : '-'
// 부가세 미적용 여부: '비과세' 또는 '미희망' 키워드 포함 시
const isNoVatMethod = (method: string | null | undefined): boolean =>
  !!method && (method.includes('비과세') || method.includes('미희망') || method === '현금(부가세 X)')

const rowTotal = (app: Application) => {
  return (app.supply_amount ?? 0) + (isNoVatMethod(app.payment_method) ? 0 : (app.vat ?? 0))
}

function isMigrationError(msg: string) {
  return msg.includes('does not exist') || msg.includes('column') || msg.includes('no such column')
}

// ─── 시공일자 → 주차 정보 ────────────────────────────────────
function getWeekInfo(dateStr: string): { key: string; label: string } {
  const date = new Date(dateStr.slice(0, 10) + 'T00:00:00+09:00')
  const dow = date.getDay() // 0=일,1=월,...,6=토
  const daysToMon = dow === 0 ? -6 : 1 - dow
  const monday = new Date(date)
  monday.setDate(date.getDate() + daysToMon)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  // 해당 월에서 몇 번째 월요일인지 카운트
  const y = monday.getFullYear()
  const m = monday.getMonth()
  let weekNum = 0
  for (let d = 1; d <= monday.getDate(); d++) {
    if (new Date(y, m, d).getDay() === 1) weekNum++
  }

  const fm = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
  const label = `${m + 1}월 ${weekNum}주차 (${fm(monday)} ~ ${fm(sunday)})`
  return { key: `${y}-${m + 1}-w${weekNum}`, label }
}

function sortApplications(apps: Application[], field: SortField, dir: SortDir): Application[] {
  return [...apps].sort((a, b) => {
    let va: string | null = null
    let vb: string | null = null
    if (field === 'construction_date') {
      // 날짜+시간 합산으로 이차 정렬
      const aKey = a.construction_date
        ? `${a.construction_date}T${a.construction_time ?? '00:00'}`
        : null
      const bKey = b.construction_date
        ? `${b.construction_date}T${b.construction_time ?? '00:00'}`
        : null
      if (aKey == null && bKey == null) return 0
      if (aKey == null) return 1
      if (bKey == null) return -1
      const cmp = aKey < bKey ? -1 : aKey > bKey ? 1 : 0
      return dir === 'desc' ? -cmp : cmp
    }
    else if (field === 'created_at') { va = a.created_at; vb = b.created_at }
    else if (field === 'business_name') { va = a.business_name; vb = b.business_name }
    else if (field === 'owner_name') { va = a.owner_name; vb = b.owner_name }
    else if (field === 'payment_method') { va = a.payment_method; vb = b.payment_method }
    else if (field === 'status') { va = a.status; vb = b.status }
    else if (field === 'total_amount') { va = String(rowTotal(a)).padStart(15, '0'); vb = String(rowTotal(b)).padStart(15, '0') }
    // null값 항상 마지막
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    const cmp = va < vb ? -1 : va > vb ? 1 : 0
    return dir === 'desc' ? -cmp : cmp
  })
}

// ─── 소형 UI 컴포넌트 ────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">{title}</p>
      {children}
    </div>
  )
}
function EditRow({ label, value, onChange, mono }: { label: string; value: string; onChange: (v: string) => void; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-text-secondary w-20 shrink-0">{label}</span>
      <input value={value} onChange={e => onChange(e.target.value)}
        className={`flex-1 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500 ${mono ? 'font-mono' : ''}`} />
    </div>
  )
}
function AmountInput({ label, value, onChange, hint, disabled }: {
  label: string; value: string; onChange: (v: string) => void; hint?: string; disabled?: boolean
}) {
  return (
    <div>
      <label className="text-xs text-text-secondary mb-1 block">
        {label}{hint && <span className="ml-1 text-brand-500">{hint}</span>}
      </label>
      <input type="number" value={value} onChange={e => onChange(e.target.value)}
        placeholder="0" disabled={disabled}
        className="w-full border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-surface-sunken" />
    </div>
  )
}

// ─── Google Drive 폴더 생성/변경 모달 ────────────────────────

// ─── 메인 페이지 ─────────────────────────────────────────────
// ─── 서비스관리 캘린더 뷰 ────────────────────────────────────────

function AppCalendarView({
  selectedMonth, applications, onSelectApp,
  calDate, calDateApps, onDaySelect, onDayClose,
  allDates, onDateChange,
}: {
  selectedMonth: string
  applications: Application[]
  onSelectApp: (app: Application) => void
  calDate: string | null
  calDateApps: Application[]
  onDaySelect: (dateStr: string, apps: Application[]) => void
  onDayClose: () => void
  allDates: string[]
  onDateChange: (date: string) => void
}) {
  const [y, m] = selectedMonth.split('-').map(Number)
  const year = y
  const month = m - 1 // 0-indexed for Date
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayStr = getScheduleToday()

  const dayMap = useMemo(() => {
    const map: Record<string, Application[]> = {}
    for (const app of applications) {
      if (!app.construction_date) continue
      const d = app.construction_date.slice(0, 10)
      if (!map[d]) map[d] = []
      map[d].push(app)
    }
    return map
  }, [applications])

  const dayAmountMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const app of applications) {
      if (!app.construction_date) continue
      const d = app.construction_date.slice(0, 10)
      map[d] = (map[d] ?? 0) + rowTotal(app)
    }
    return map
  }, [applications])

  const monthTotal = useMemo(() =>
    applications.reduce((sum, app) => sum + rowTotal(app), 0)
  , [applications])

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  // 7개씩 묶어 주(week) 단위로 분리
  const weeks: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    const week = cells.slice(i, i + 7)
    while (week.length < 7) week.push(null)
    weeks.push(week)
  }

  const DAYS = ['일', '월', '화', '수', '목', '금', '토']

  // 스와이프 로직
  const touchStartX = useRef<number | null>(null)
  const currentDateIdx = calDate ? allDates.indexOf(calDate) : -1
  const hasPrev = currentDateIdx > 0
  const hasNext = currentDateIdx < allDates.length - 1
  const goToDate = (delta: number) => {
    const newIdx = currentDateIdx + delta
    if (newIdx >= 0 && newIdx < allDates.length) {
      onDateChange(allDates[newIdx])
    }
  }
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const delta = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(delta) > 40) goToDate(delta > 0 ? 1 : -1)
    touchStartX.current = null
  }

  return (
    <>
      <div className="bg-surface rounded-xl border border-border overflow-y-auto flex-1">
        <div className="grid grid-cols-7 border-b border-border-subtle sticky top-0 bg-surface z-10">
          {DAYS.map(d => (
            <div key={d} className={`text-center py-2.5 text-xs font-semibold
              ${d === '일' ? 'text-red-500' : d === '토' ? 'text-brand-500' : 'text-text-secondary'}`}>
              {d}
            </div>
          ))}
        </div>
        <div className="flex flex-col">
          {weeks.map((week, wi) => {
            const weekTotal = week.reduce<number>((sum, day) => {
              if (!day) return sum
              const d = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              return sum + (dayAmountMap[d] ?? 0)
            }, 0)
            return (
              <div key={wi}>
                <div className="grid grid-cols-7">
                  {week.map((day, di) => {
                    if (!day) return <div key={`e-${wi}-${di}`} className="border-r border-b border-border-subtle bg-surface-sunken/40" />
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    const apps = dayMap[dateStr] ?? []
                    const isToday = dateStr === todayStr
                    const dow = (firstDay + day - 1) % 7
                    const hasApps = apps.length > 0
                    const dayAmount = dayAmountMap[dateStr] ?? 0
                    return (
                      <div
                        key={day}
                        onClick={() => hasApps && onDaySelect(dateStr, apps)}
                        className={`border-r border-b border-border-subtle p-1.5 flex flex-col gap-0.5 min-h-[5rem] sm:min-h-[7rem]
                          ${isToday ? 'bg-brand-50' : (dow === 0 || dow === 6) ? 'bg-surface-sunken/50' : ''}
                          ${hasApps ? 'cursor-pointer hover:bg-brand-50/30 transition-colors' : ''}`}
                      >
                        <div className="min-w-0">
                          <div className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full shrink-0
                            ${isToday ? 'bg-brand-600 text-white' : dow === 0 ? 'text-red-500' : dow === 6 ? 'text-brand-500' : 'text-text-primary'}`}>
                            {day}
                          </div>
                          {dayAmount > 0 && (
                            <span className="text-[9px] font-semibold text-emerald-600 whitespace-nowrap leading-tight">
                              {dayAmount >= 10000 ? `${+(dayAmount / 10000).toFixed(1)}만` : `${dayAmount.toLocaleString('ko-KR')}`}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col gap-0.5 overflow-hidden">
                          {apps.slice(0, 3).map(app => {
                            const cfg = STATUS_CONFIG[app.status] ?? STATUS_CONFIG['예약확정']
                            return (
                              <div key={app.id} className={`px-1 py-px rounded text-[9px] font-semibold truncate leading-tight ${cfg.color}`}>
                                {app.business_name}
                              </div>
                            )
                          })}
                          {apps.length > 3 && (
                            <div className="text-[10px] text-text-tertiary px-1 font-medium">+{apps.length - 3}건</div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {weekTotal > 0 && (
                  <div className="flex justify-end items-center px-3 py-1 border-b border-border-subtle bg-emerald-50/60">
                    <span className="text-xs font-semibold text-emerald-700">주간 합계 {weekTotal.toLocaleString('ko-KR')}원</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* 월간 총액 */}
        {monthTotal > 0 && (
          <div className="flex justify-between items-center px-4 py-3 border-t border-border bg-emerald-50">
            <span className="text-sm font-bold text-emerald-800">{selectedMonth.slice(0, 4)}년 {selectedMonth.slice(5, 7)}월 총액</span>
            <span className="text-sm font-bold text-emerald-700">{monthTotal.toLocaleString('ko-KR')}원</span>
          </div>
        )}

        <div className="pb-20" />
      </div>

      {/* 날짜 목록 패널 */}
      {calDate && (
        <div className="fixed inset-0 z-[55] bg-black/40 flex items-end md:items-center justify-center"
          onClick={onDayClose}>
          <div
            className="bg-surface w-full max-w-md rounded-t-2xl md:rounded-2xl flex flex-col overflow-hidden"
            style={{ maxHeight: 'calc(80vh - env(safe-area-inset-bottom))' }}
            onClick={e => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle shrink-0">
              <button
                onClick={() => goToDate(-1)}
                disabled={!hasPrev}
                className={`w-8 h-8 flex items-center justify-center rounded-lg text-xl transition-colors ${hasPrev ? 'text-text-secondary hover:bg-surface-sunken' : 'text-text-tertiary cursor-not-allowed'}`}
              >
                ‹
              </button>
              <div className="text-center">
                <h3 className="font-bold text-text-primary">
                  {calDate.slice(5, 7)}월 {calDate.slice(8, 10)}일
                  ({['일','월','화','수','목','금','토'][new Date(calDate + 'T12:00:00').getDay()]})
                </h3>
                <p className="text-xs text-text-tertiary">{calDateApps.length}건</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => goToDate(1)}
                  disabled={!hasNext}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg text-xl transition-colors ${hasNext ? 'text-text-secondary hover:bg-surface-sunken' : 'text-text-tertiary cursor-not-allowed'}`}
                >
                  ›
                </button>
                <button onClick={onDayClose} className="w-8 h-8 flex items-center justify-center text-text-tertiary hover:text-text-secondary text-lg leading-none">✕</button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-3 pb-6 flex flex-col gap-2">
              {calDateApps.map(app => {
                const cfg = STATUS_CONFIG[app.status] ?? STATUS_CONFIG['예약확정']
                return (
                  <button key={app.id}
                    onClick={() => { onSelectApp(app); onDayClose() }}
                    className="text-left bg-surface-sunken hover:bg-brand-50 border border-border-subtle hover:border-brand-200 rounded-xl p-3 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                      <span className="font-semibold text-text-primary text-sm">{app.business_name}</span>
                      <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full shrink-0 ${cfg.badge}`}>{app.status}</span>
                    </div>
                    <p className="text-xs text-text-secondary ml-4">{app.owner_name}</p>
                    {app.address && <p className="text-[11px] text-text-tertiary truncate ml-4 mt-0.5">{app.address}</p>}
                    {app.care_scope && <p className="text-[11px] text-brand-500 ml-4 mt-0.5 line-clamp-1">{app.care_scope}</p>}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default function ServiceManagementPage() {
  const router = useRouter()
  const [applications, setApplications] = useState<Application[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<string[]>([])
  const [savedAssignments, setSavedAssignments] = useState<WorkAssignment[]>([])
  const [workerDropdownOpen, setWorkerDropdownOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  // 서비스 유형 복수 선택 (빈 Set = 전체)
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set())
  const [showUnassigned, setShowUnassigned] = useState(false)
  const [selected, setSelected] = useState<Application | null>(null)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [viewedNewIds, setViewedNewIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem('viewed_apps_new') ?? '[]')) } catch { return new Set() }
  })
  const addViewedNew = (id: string) => setViewedNewIds(prev => {
    const next = new Set(prev).add(id)
    try { sessionStorage.setItem('viewed_apps_new', JSON.stringify(Array.from(next))) } catch { /* ignore */ }
    return next
  })

  // 정렬
  const [sortField, setSortField] = useState<SortField>('construction_date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // 보기 모드
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [calDate, setCalDate] = useState<string | null>(null)
  const [calDateApps, setCalDateApps] = useState<Application[]>([])

  // 지도 앱 선택 모달
  const [mapAddress, setMapAddress] = useState<string | null>(null)

  // 월 필터
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))

  // 필터
  const [paymentFilter, setPaymentFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // 알림
  const [notifyType, setNotifyType] = useState('')
  const [notifyLogs, setNotifyLogs] = useState<NotifyLog[]>([])

  // 체크박스 이관
  const [checkedIds, setCheckedIds] = useState<string[]>([])
  const [bulkSaving, setBulkSaving] = useState(false)

  const toggleCheck = (id: string) =>
    setCheckedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  // Google Drive
  const [savedDriveFolder, setSavedDriveFolder] = useState<DriveFolder | null>(null)
  const [driveCreating, setDriveCreating] = useState(false)
  const [driveApisReady, setDriveApisReady] = useState(false)
  const [driveConfirming, setDriveConfirming] = useState(false)

  // 편집 필드
  const [ownerName, setOwnerName] = useState('')
  const [businessNameEdit, setBusinessNameEdit] = useState('')
  const [adminNotes, setAdminNotes] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [constructionDate, setConstructionDate] = useState('')
  const [constructionTime, setConstructionTime] = useState('')
  const [unitPricePerVisit, setUnitPricePerVisit] = useState('')
  const [deposit, setDeposit] = useState('')
  const [supplyAmount, setSupplyAmount] = useState('')
  const [vat, setVat] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [businessNumber, setBusinessNumber] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [elevator, setElevator] = useState('')
  const [buildingAccess, setBuildingAccess] = useState('')
  const [parking, setParking] = useState('')
  const [accessMethod, setAccessMethod] = useState('')
  const [requestNotes, setRequestNotes] = useState('')
  const [adminRequestNotes, setAdminRequestNotes] = useState('')
  const [careScope, setCareScope] = useState('')
  const [businessHoursStart, setBusinessHoursStart] = useState('')
  const [businessHoursEnd, setBusinessHoursEnd] = useState('')
  const [preMeetingAt, setPreMeetingAt] = useState('')

  const vatManual = useRef(false)

  // 스크롤 복원 (모바일 뒤로가기 후 선택 행으로 돌아오기)
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({})
  const prevSelectedIdRef = useRef<string | null>(null)

  const closePanel = useCallback(() => {
    prevSelectedIdRef.current = selected?.id ?? null
    setSelected(null)
  }, [selected])

  useEffect(() => {
    if (!selected && prevSelectedIdRef.current) {
      const el = rowRefs.current[prevSelectedIdRef.current]
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      prevSelectedIdRef.current = null
    }
  }, [selected])

  useModalBackButton(!!selected, closePanel)

  const todayStr = getScheduleToday()
  const sevenDaysAgoStr = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const isCashNoVat = isNoVatMethod(paymentMethod)
  const effectiveVat = isCashNoVat ? 0 : (Number(vat) || 0)
  const totalAmount = (Number(supplyAmount) || 0) + effectiveVat
  const computedBalance = totalAmount - (Number(deposit) || 0)

  useEffect(() => {
    setSavedDriveFolder(getDriveFolderCookie())
    loadGoogleAPIs().then(() => setDriveApisReady(true)).catch(() => {})
  }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [appRes, userRes, workerRes] = await Promise.all([
      fetch('/api/admin/applications'),
      fetch('/api/admin/users'),
      fetch('/api/admin/workers'),
    ])
    const appData = await appRes.json()
    const userData = await userRes.json()
    const workerData = await workerRes.json()
    setApplications(appData.applications ?? [])
    setUsers((userData.users ?? []).filter((u: User) => u.role !== 'customer'))
    setWorkers(workerData.workers ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => { fetch('/api/admin/nav-badges?key=applications', { method: 'DELETE' }).catch(() => {}) }, [])

  const handleSelect = (app: Application) => {
    setSelected(app)
    addViewedNew(app.id)
    // 신청서 제출 값 우선 반영 (null이면 빈 문자열)
    setOwnerName(app.owner_name ?? '')
    setBusinessNameEdit(app.business_name ?? '')
    setAdminNotes(app.admin_notes ?? '')
    setAssignedTo(app.assigned_to ?? '')
    setConstructionDate(app.construction_date ?? '')
    setConstructionTime(app.construction_time ?? '')
    setDeposit(String(app.deposit ?? ''))
    setSupplyAmount(String(app.supply_amount ?? ''))
    setVat(String(app.vat ?? ''))
    setPaymentMethod(app.payment_method ?? '')
    setPhone(app.phone ?? '')
    setEmail(app.email ?? '')
    setAddress(app.address ?? '')
    setBusinessNumber(app.business_number ?? '')
    setAccountNumber(app.account_number ?? '')
    setElevator(app.elevator ?? '')
    setBuildingAccess(app.building_access ?? '')
    setParking(app.parking ?? '')
    setAccessMethod(app.access_method ?? '')
    setRequestNotes(app.request_notes ?? '')
    setAdminRequestNotes(app.admin_request_notes ?? '')
    setCareScope(app.care_scope ?? '')
    setBusinessHoursStart(app.business_hours_start ?? '')
    setBusinessHoursEnd(app.business_hours_end ?? '')
    setUnitPricePerVisit(app.unit_price_per_visit != null ? String(app.unit_price_per_visit) : '')
    setPreMeetingAt(app.pre_meeting_at ? app.pre_meeting_at.slice(0, 16) : '')
    setNotifyType('')

    // DB notification_log를 소스로 사용 (디바이스 무관하게 동일한 이력 표시)
    const dbLogs: NotifyLog[] = Array.isArray(app.notification_log)
      ? app.notification_log.map(dbLogToNotifyLog)
      : []
    setNotifyLogs(dbLogs)
    setSelectedWorkerIds([])
    setSavedAssignments([])
    setWorkerDropdownOpen(false)
    vatManual.current = false
    // 작업자 배정 이력 로드
    fetch(`/api/admin/work-assignments?application_id=${app.id}`)
      .then(r => r.json())
      .then(d => {
        const asgns: WorkAssignment[] = d.assignments ?? []
        setSavedAssignments(asgns)
        setSelectedWorkerIds(asgns.map((a: WorkAssignment) => a.worker_id))
      })
      .catch(() => { /* workers table 미생성 시 무시 */ })
  }

  const handleWorkerToggle = (workerId: string) => {
    if (!selected) return
    setSelectedWorkerIds(prev =>
      prev.includes(workerId)
        ? prev.filter(id => id !== workerId)
        : [...prev, workerId]
    )
  }

  const handleSaveToCustomer = async () => {
    if (!selected) return
    const customerType =
      selected.service_type === '정기딥케어' ? '정기딥케어' :
      selected.service_type === '정기엔드케어' ? '정기엔드케어' : '1회성케어'
    try {
      const res = await fetch('/api/admin/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // 일반정보
          business_name: selected.business_name,
          contact_name: selected.owner_name,
          contact_phone: selected.phone,
          email: selected.email,
          platform_nickname: selected.platform_nickname,
          business_number: selected.business_number,
          account_number: selected.account_number,
          // 작업장정보
          address: selected.address,
          elevator: selected.elevator,
          building_access: selected.building_access,
          parking_info: selected.parking,
          access_method: selected.access_method,
          business_hours_start: selected.business_hours_start,
          business_hours_end: selected.business_hours_end,
          // 시공정보
          care_scope: selected.care_scope,
          special_notes: selected.request_notes,
          // 결제정보
          payment_method: selected.payment_method,
          unit_price: selected.unit_price_per_visit,
          deposit: selected.deposit,
          supply_amount: selected.supply_amount,
          vat: selected.vat,
          balance: selected.balance,
          // 메타
          customer_type: customerType,
          disposition: selected.disposition ?? '보통',
          pipeline_status: 'inquiry',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '저장 실패')
      toast.success('고객 DB에 저장되었습니다. 고객 관리 탭에서 확인하세요.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패')
    }
  }

  const handleDuplicateBulk = async () => {
    if (checkedIds.length === 0) return
    if (!confirm(`선택한 ${checkedIds.length}건의 신청서를 복제하시겠습니까?`)) return
    setBulkSaving(true)
    let successCount = 0, failCount = 0
    const newItems: Application[] = []
    for (const id of checkedIds) {
      try {
        const res = await fetch(`/api/admin/applications/${id}/duplicate`, { method: 'POST' })
        const d = await res.json()
        if (res.ok && d.application) {
          newItems.push(d.application as Application)
          successCount++
        } else failCount++
      } catch { failCount++ }
    }
    if (newItems.length > 0) {
      setApplications(prev => [...newItems, ...prev])
    }
    setBulkSaving(false)
    setCheckedIds([])
    if (failCount === 0) toast.success(`${successCount}건 복제되었습니다.`)
    else toast.error(`${successCount}건 성공, ${failCount}건 실패`)
  }

  const handleDeleteApplicationBulk = async () => {
    if (checkedIds.length === 0) return
    if (!confirm(`선택한 ${checkedIds.length}건의 신청서를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return
    setBulkSaving(true)
    let successCount = 0, failCount = 0
    for (const id of checkedIds) {
      try {
        const res = await fetch(`/api/admin/applications?id=${id}`, { method: 'DELETE' })
        if (res.ok) {
          successCount++
          if (selected?.id === id) setSelected(null)
        } else failCount++
      } catch { failCount++ }
    }
    setApplications(prev => prev.filter(a => !checkedIds.includes(a.id)))
    setBulkSaving(false)
    setCheckedIds([])
    if (failCount === 0) toast.success(`${successCount}건 삭제되었습니다.`)
    else toast.error(`${successCount}건 성공, ${failCount}건 실패`)
  }

  const handleSaveToCustomerBulk = async () => {
    if (checkedIds.length === 0) return
    setBulkSaving(true)
    const targets = applications.filter(a => checkedIds.includes(a.id))
    let successCount = 0
    let failCount = 0
    for (const app of targets) {
      const customerType =
        app.service_type === '정기딥케어' ? '정기딥케어' :
        app.service_type === '정기엔드케어' ? '정기엔드케어' : '1회성케어'
      try {
        const res = await fetch('/api/admin/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // 일반정보
            business_name: app.business_name,
            contact_name: app.owner_name,
            contact_phone: app.phone,
            email: app.email,
            platform_nickname: app.platform_nickname,
            business_number: app.business_number,
            account_number: app.account_number,
            // 작업장정보
            address: app.address,
            elevator: app.elevator,
            building_access: app.building_access,
            parking_info: app.parking,
            access_method: app.access_method,
            business_hours_start: app.business_hours_start,
            business_hours_end: app.business_hours_end,
            // 시공정보
            care_scope: app.care_scope,
            special_notes: app.request_notes,
            // 결제정보
            payment_method: app.payment_method,
            unit_price: app.unit_price_per_visit,
            deposit: app.deposit,
            supply_amount: app.supply_amount,
            vat: app.vat,
            balance: app.balance,
            // 메타
            customer_type: customerType,
            pipeline_status: 'inquiry',
          }),
        })
        if (res.ok) successCount++
        else failCount++
      } catch { failCount++ }
    }
    setBulkSaving(false)
    setCheckedIds([])
    if (failCount === 0) toast.success(`고객 DB에 ${successCount}건이 저장되었습니다.`)
    else toast.error(`${successCount}건 성공, ${failCount}건 실패`)
  }

  const handleTaxInvoiceBulk = async () => {
    if (checkedIds.length === 0) return
    if (!confirm(`선택한 ${checkedIds.length}건으로 세금계산서 파일을 생성하시겠습니까?`)) return
    setBulkSaving(true)
    try {
      const res = await fetch('/api/admin/tax-invoice-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_ids: checkedIds }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || '발행 요청 실패')
        return
      }
      toast.success(`${json.count}건 발행 요청 완료 — 구글드라이브 폴더에 파일이 생성됩니다.`)
      setCheckedIds([])
    } catch {
      toast.error('네트워크 오류가 발생했습니다.')
    } finally {
      setBulkSaving(false)
    }
  }

  const handleDeleteApplication = async () => {
    if (!selected) return
    if (!confirm(`"${selected.business_name}" 신청서를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return
    try {
      const res = await fetch(`/api/admin/applications?id=${selected.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '삭제 실패')
      toast.success('삭제되었습니다.')
      setApplications(prev => prev.filter(a => a.id !== selected.id))
      setSelected(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '삭제 실패')
    }
  }

  const quickSave = async (fields: Partial<Application>) => {
    if (!selected) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, ...fields }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '저장 실패')
      toast.success('변경되었습니다.')
      setSelected(prev => prev ? { ...prev, ...fields } : prev)
      setApplications(prev => prev.map(a => a.id === selected.id ? { ...a, ...fields } : a))
    } catch (e) {
      const msg = e instanceof Error ? e.message : '저장 실패'
      if (isMigrationError(msg)) {
        toast.error('⚠️ Supabase SQL 마이그레이션을 먼저 실행해주세요.', { duration: 6000 })
      } else { toast.error(msg) }
    } finally { setSaving(false) }
  }

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selected.id,
          owner_name: ownerName || null,
          business_name: businessNameEdit || null,
          admin_notes: adminNotes,
          assigned_to: assignedTo || null,
          construction_date: constructionDate || null,
          construction_time: constructionTime || null,
          deposit: Number(deposit) || 0,
          supply_amount: Number(supplyAmount) || 0,
          vat: effectiveVat,
          balance: computedBalance,
          payment_method: paymentMethod || null,
          phone: phone || null,
          email: email || null,
          address: address || null,
          business_number: businessNumber || null,
          account_number: accountNumber || null,
          elevator: elevator || null,
          building_access: buildingAccess || null,
          access_method: accessMethod || null,
          parking: parking || null,
          request_notes: requestNotes || null,
          admin_request_notes: adminRequestNotes || null,
          care_scope: careScope || null,
          business_hours_start: businessHoursStart || null,
          business_hours_end: businessHoursEnd || null,
          unit_price_per_visit: unitPricePerVisit !== '' ? Number(unitPricePerVisit) : null,
          pre_meeting_at: preMeetingAt || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '저장 실패')

      // 작업자 배정 동기화 (전체 저장 시 함께 처리)
      const savedWorkerIds = savedAssignments.map(a => a.worker_id)
      const toAdd = selectedWorkerIds.filter(id => !savedWorkerIds.includes(id))
      const toRemove = savedAssignments.filter(a => !selectedWorkerIds.includes(a.worker_id))
      const addedResults = await Promise.all(
        toAdd.map(wid =>
          fetch('/api/admin/work-assignments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              worker_id: wid,
              application_id: selected.id,
              construction_date: constructionDate || selected.construction_date || null,
              business_name: businessNameEdit || selected.business_name,
            }),
          }).then(r => r.json())
        )
      )
      await Promise.all(
        toRemove.map(asgn =>
          fetch('/api/admin/work-assignments', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: asgn.id }),
          })
        )
      )
      const addedAssignments: WorkAssignment[] = addedResults
        .filter((d): d is { assignment: WorkAssignment } => !!d?.assignment)
        .map(d => d.assignment)
      setSavedAssignments([
        ...savedAssignments.filter(a => selectedWorkerIds.includes(a.worker_id)),
        ...addedAssignments,
      ])

      toast.success('저장되었습니다.')
      await fetchAll()
    } catch (e) {
      const msg = e instanceof Error ? e.message : '저장 실패'
      if (isMigrationError(msg)) {
        toast.error('⚠️ Supabase SQL 마이그레이션을 먼저 실행해주세요.', { duration: 6000 })
      } else { toast.error(msg) }
    } finally { setSaving(false) }
  }

  const handleSupplyChange = (val: string) => {
    setSupplyAmount(val)
    if (!isCashNoVat && !vatManual.current) {
      setVat(String(Math.round((Number(val) || 0) * 0.1)))
    }
  }
  const handleVatChange = (val: string) => { vatManual.current = true; setVat(val) }
  const handlePaymentMethodChange = (val: string) => {
    setPaymentMethod(val)
    if (isNoVatMethod(val)) { setVat('0'); vatManual.current = true }
    else { vatManual.current = false; if (supplyAmount) setVat(String(Math.round((Number(supplyAmount) || 0) * 0.1))) }
  }

  const handleNotify = async () => {
    if (!selected || !notifyType) { toast.error('알림 유형을 선택해주세요.'); return }
    setSending(true)
    try {
      const res = await fetch('/api/admin/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: selected.id, type: notifyType, method: 'manual' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const nowIso = new Date().toISOString()
      const log: NotifyLog = { type: notifyType, sentAt: nowIso, method: 'manual' }
      const dbEntry = { type: notifyType, sent_at: nowIso, method: 'manual' as const }
      setNotifyLogs(prev => [log, ...prev])
      setSelected(prev => prev ? {
        ...prev,
        notification_log: [dbEntry, ...(prev.notification_log ?? [])],
        ...(data.new_status ? { status: data.new_status } : {}),
      } : prev)
      setApplications(prev => prev.map(a => a.id === selected.id ? {
        ...a,
        notification_log: [dbEntry, ...(a.notification_log ?? [])],
        ...(data.new_status ? { status: data.new_status } : {}),
      } : a))
      toast.success(`${notifyType} 발송 완료`)
      setNotifyType('')
      // 작업완료알림은 서버에서 계정안내알림을 자동 발송하므로 DB 재조회
      if (notifyType === '작업완료알림') setTimeout(() => fetchAll(), 1500)
    } catch (e) { toast.error(e instanceof Error ? e.message : '발송 실패') }
    finally { setSending(false) }
  }

  const handleResend = async (type: string) => {
    if (!selected) return
    setSending(true)
    try {
      const res = await fetch('/api/admin/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: selected.id, type }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const nowIso = new Date().toISOString()
      const log: NotifyLog = { type: `[재발송] ${type}`, sentAt: nowIso, method: 'manual' }
      const dbEntry = { type, sent_at: nowIso, method: 'manual' as const }
      setNotifyLogs(prev => [log, ...prev])
      setSelected(prev => prev ? {
        ...prev,
        notification_log: [dbEntry, ...(prev.notification_log ?? [])],
        ...(data.new_status ? { status: data.new_status } : {}),
      } : prev)
      setApplications(prev => prev.map(a => a.id === selected.id ? {
        ...a,
        notification_log: [dbEntry, ...(a.notification_log ?? [])],
        ...(data.new_status ? { status: data.new_status } : {}),
      } : a))
      toast.success(`${type} 재발송 완료`)
      if (type === '작업완료알림') setTimeout(() => fetchAll(), 1500)
    } catch (e) { toast.error(e instanceof Error ? e.message : '재발송 실패') }
    finally { setSending(false) }
  }

  // 폴더 생성/변경: user gesture context 유지를 위해 즉시 requestGoogleToken() 호출
  function handleDriveCreate() {
    if (!selected) return
    if (!driveApisReady) {
      toast.error('Google API 로딩 중입니다. 잠시 후 다시 시도해주세요.')
      return
    }
    // 이미 폴더가 있는 경우(위치 변경) 또는 저장된 위치 없으면 바로 피커 열기
    if (selected.drive_folder_url || !savedDriveFolder) {
      executeDriveCreateWithPicker()
      return
    }
    // 저장된 위치가 있으면 확인 UI 표시
    setDriveConfirming(true)
  }

  // 저장된 위치에 바로 생성 (user gesture 컨텍스트 필요)
  function executeDriveCreateWithSaved() {
    if (!selected || !savedDriveFolder) return
    setDriveConfirming(false)
    const date = constructionDate || today()
    const folder = savedDriveFolder
    requestGoogleToken()
      .then(async token => {
        setDriveCreating(true)
        try {
          const result = await createWorkFolderStructure(folder.id, selected.business_name, date, token)
          const folderUrl = result.folderUrl
          await fetch('/api/admin/applications', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: selected.id, drive_folder_url: folderUrl, construction_date: date }),
          })
          setConstructionDate(date)
          setSelected(prev => prev ? { ...prev, drive_folder_url: folderUrl, construction_date: date } : prev)
          setApplications(prev => prev.map(a => a.id === selected.id ? { ...a, drive_folder_url: folderUrl, construction_date: date } : a))
          toast.success(`✅ "${result.folderName}" 폴더 생성 완료!`, { duration: 5000 })
          window.open(folderUrl, '_blank')
        } catch (e) {
          const msg = e instanceof Error ? e.message : '처리 실패'
          const isTrulyMissing = msg.includes('File not found') && !msg.toLowerCase().includes('permission')
          if (isTrulyMissing) {
            toast.error('Drive 폴더를 찾을 수 없습니다. 위치를 다시 지정해주세요.', { duration: 5000 })
            setSavedDriveFolder(null)
            document.cookie = 'bbk_drive_folder=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/'
          } else {
            toast.error(`처리 실패: ${msg}`, { duration: 8000 })
          }
        } finally {
          setDriveCreating(false)
        }
      })
      .catch(e => toast.error(e instanceof Error ? e.message : 'Google Drive 연결 실패'))
  }

  // 폴더 피커로 위치 선택 후 생성 (user gesture 컨텍스트 필요)
  function executeDriveCreateWithPicker() {
    if (!selected) return
    setDriveConfirming(false)
    const date = constructionDate || today()
    let capturedToken = ''
    requestGoogleToken()
      .then(token => {
        capturedToken = token
        return openFolderPicker(token)
      })
      .then(async picked => {
        if (!picked) return
        const parentFolder = await resolveFolder(picked, capturedToken)
        if (!parentFolder) return
        setSavedDriveFolder(parentFolder)
        saveDriveFolderCookie(parentFolder)
        setDriveCreating(true)
        try {
          const result = await createWorkFolderStructure(parentFolder.id, selected.business_name, date, capturedToken)
          const folderUrl = result.folderUrl
          await fetch('/api/admin/applications', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: selected.id, drive_folder_url: folderUrl, construction_date: date }),
          })
          setConstructionDate(date)
          setSelected(prev => prev ? { ...prev, drive_folder_url: folderUrl, construction_date: date } : prev)
          setApplications(prev => prev.map(a => a.id === selected.id ? { ...a, drive_folder_url: folderUrl, construction_date: date } : a))
          toast.success(`✅ "${result.folderName}" 폴더 생성 완료!`, { duration: 5000 })
          window.open(folderUrl, '_blank')
        } catch (e) {
          const msg = e instanceof Error ? e.message : '처리 실패'
          const isTrulyMissing = msg.includes('File not found') && !msg.toLowerCase().includes('permission')
          if (isTrulyMissing) {
            toast.error('Drive 폴더를 찾을 수 없습니다. 다시 시도해주세요.', { duration: 5000 })
            setSavedDriveFolder(null)
            document.cookie = 'bbk_drive_folder=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/'
          } else {
            toast.error(`처리 실패: ${msg}`, { duration: 8000 })
          }
        } finally {
          setDriveCreating(false)
        }
      })
      .catch(e => toast.error(e instanceof Error ? e.message : 'Google Drive 연결 실패'))
  }

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir(field === 'construction_date' ? 'desc' : 'asc')
    }
  }

  const unassignedCount = applications.filter(a => !a.assigned_to).length

  // 헤더 auto-hide
  const [filtersVisible, setFiltersVisible] = useState(true)
  const lastScrollY = useRef(0)
  const listContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = listContainerRef.current
    if (!container) return
    // viewMode가 list로 돌아올 때 스크롤 상태 초기화
    lastScrollY.current = 0
    setFiltersVisible(true)
    const onScroll = () => {
      const current = container.scrollTop
      const scrollable = container.scrollHeight - container.clientHeight
      // 스크롤 가능 거리가 충분하지 않으면 필터 항상 표시 (짧은 목록 튕김 방지)
      if (scrollable < 120) {
        setFiltersVisible(true)
        lastScrollY.current = current
        return
      }
      setFiltersVisible(current < lastScrollY.current || current < 50)
      lastScrollY.current = current
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [viewMode, showUnassigned])

  const toggleType = (t: string) => {
    setSelectedTypes(prev => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
    setShowUnassigned(false)
  }

  const moveMonth = (delta: number) => {
    const [y, m] = selectedMonth.split('-').map(Number)
    const next = new Date(y, m - 1 + delta, 1)
    setSelectedMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`)
  }

  const filteredApps = (() => {
    let filtered = [...applications]

    if (showUnassigned) {
      filtered = filtered.filter(a => !a.assigned_to)
    } else {
      // 월 필터 (시공일자 기준)
      filtered = filtered.filter(a => a.construction_date?.startsWith(selectedMonth))
      // 서비스 유형 복수 필터 (아무것도 선택 안 하면 전체)
      if (selectedTypes.size > 0) {
        filtered = filtered.filter(a => selectedTypes.has(a.service_type ?? '1회성케어'))
      }
    }

    // 결제방법 필터
    if (paymentFilter) filtered = filtered.filter(a => a.payment_method === paymentFilter)

    // 검색: 업체명, 고객명, 연락처, 주소, 케어범위, 계좌번호, 사업자번호, 공급가액
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      filtered = filtered.filter(a =>
        a.business_name.toLowerCase().includes(q) ||
        a.owner_name.toLowerCase().includes(q) ||
        a.phone.toLowerCase().includes(q) ||
        (a.address ?? '').toLowerCase().includes(q) ||
        (a.care_scope ?? '').toLowerCase().includes(q) ||
        (a.account_number ?? '').toLowerCase().includes(q) ||
        (a.business_number ?? '').toLowerCase().includes(q) ||
        (a.supply_amount != null ? String(a.supply_amount) : '').includes(q)
      )
    }

    return sortApplications(filtered, sortField, sortDir)
  })()

  const allCalDates = useMemo(() => {
    const dates = new Set(
      filteredApps
        .filter(a => a.construction_date)
        .map(a => a.construction_date!.slice(0, 10))
    )
    return Array.from(dates).sort()
  }, [filteredApps])

  return (
    <>
      {mapAddress && (
        <MapSelectorModal address={mapAddress} onClose={() => setMapAddress(null)} />
      )}

      <div className="relative flex h-full gap-0 min-h-0">
        {/* ── 좌측: 목록 ── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* 헤더 전체 — 아래 스크롤 시 숨김, 위 스크롤 시 즉시 표시 */}
          <div className={`transition-all duration-300 overflow-hidden md:max-h-72 md:opacity-100 ${filtersVisible ? 'max-h-72 opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-2xl font-bold text-text-primary">서비스통합관리</h1>
              {showUnassigned && (
                <p className="text-sm text-orange-600 mt-0.5">담당자가 배정되지 않은 일정입니다. 클릭하여 담당자를 지정하세요.</p>
              )}
            </div>
            <Button variant="secondary" size="sm" onClick={fetchAll}>새로고침</Button>
          </div>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {SERVICE_TYPES.map(t => {
              const active = selectedTypes.has(t)
              const TYPE_COLOR: Record<string, string> = {
                '1회성케어': active ? 'bg-gray-700 text-white border-gray-700' : 'bg-surface text-text-secondary border-border hover:border-border-strong',
                '정기딥케어': active ? 'bg-brand-600 text-white border-brand-600' : 'bg-surface text-brand-600 border-brand-200 hover:border-brand-500',
                '정기엔드케어': active ? 'bg-purple-600 text-white border-purple-600' : 'bg-surface text-purple-600 border-purple-300 hover:border-purple-500',
              }
              return (
                <button key={t}
                  onClick={() => toggleType(t)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${TYPE_COLOR[t]}`}
                >
                  <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-xs shrink-0 ${
                    active ? 'bg-white/30 border-white/50' : 'border-current'
                  }`}>
                    {active && '✓'}
                  </span>
                  {t}
                </button>
              )
            })}
            <button
              onClick={() => { setShowUnassigned(v => !v); setSelectedTypes(new Set()) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                showUnassigned ? 'bg-orange-500 text-white border-orange-500' : 'bg-surface text-orange-600 border-orange-300 hover:border-orange-500'
              }`}
            >
              <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-xs shrink-0 ${
                showUnassigned ? 'bg-white/30 border-white/50' : 'border-current'
              }`}>
                {showUnassigned && '✓'}
              </span>
              <AlertTriangle size={14} className="inline" /> 미배정
              {unassignedCount > 0 && (
                <span className="ml-0.5 bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full text-xs">{unassignedCount}</span>
              )}
            </button>
            {(selectedTypes.size > 0 || showUnassigned) && (
              <button onClick={() => { setSelectedTypes(new Set()); setShowUnassigned(false) }}
                className="text-xs text-text-tertiary hover:text-text-secondary underline">전체 보기</button>
            )}
          </div>

          {/* 검색 */}
          <div className="relative mb-2">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="업체명, 대표자, 연락처, 주소, 케어범위, 계좌·사업자번호, 금액 검색..."
              className="w-full pl-8 pr-8 py-1.5 text-xs text-text-primary border border-border rounded-lg bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary text-sm leading-none">✕</button>
            )}
          </div>

          {/* 필터 + 정렬 컨트롤 */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {!showUnassigned && (
              <MonthNavigator value={selectedMonth} onChange={setSelectedMonth} />
            )}
            {!showUnassigned && (
              <div className="flex bg-surface-sunken rounded-lg p-0.5 ml-1">
                <button
                  onClick={() => setViewMode('list')}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                    viewMode === 'list' ? 'bg-surface text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                  목록
                </button>
                <button
                  onClick={() => setViewMode('calendar')}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                    viewMode === 'calendar' ? 'bg-surface text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  캘린더
                </button>
              </div>
            )}
            <select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}
              className="text-xs border border-border rounded-lg px-2 py-1.5 bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">결제방법 전체</option>
              {['현금(계산서 희망)', '현금(비과세)', '카드(온라인 간편결제)', '플랫폼'].map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select value={`${sortField}:${sortDir}`}
              onChange={e => {
                const [f, d] = e.target.value.split(':')
                setSortField(f as SortField)
                setSortDir(d as SortDir)
              }}
              className="text-xs border border-border rounded-lg px-2 py-1.5 bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500 ml-auto">
              {(Object.entries(SORT_LABELS) as [SortField, string][]).flatMap(([f, l]) => [
                <option key={`${f}:desc`} value={`${f}:desc`}>{l} ↓</option>,
                <option key={`${f}:asc`} value={`${f}:asc`}>{l} ↑</option>,
              ])}
            </select>
            {paymentFilter && (
              <button onClick={() => setPaymentFilter('')}
                className="text-xs text-brand-500 hover:text-brand-700 underline whitespace-nowrap">
                초기화
              </button>
            )}
          </div>
          </div>{/* end auto-hide wrapper */}

          {/* 액션 바 */}
          {checkedIds.length > 0 && (
            <div className="mb-3 flex flex-col gap-2 bg-green-600 text-white px-4 py-3 rounded-xl shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{checkedIds.length}건 선택됨</span>
                <button onClick={() => setCheckedIds([])}
                  className="text-xs text-green-200 hover:text-white px-2 py-1 rounded transition-colors shrink-0">
                  선택 해제
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={handleDuplicateBulk} disabled={bulkSaving} className="bg-yellow-500 hover:bg-yellow-400 text-white whitespace-nowrap">
                  {bulkSaving ? '처리 중...' : '복제'}
                </Button>
                <Button variant="danger" size="sm" onClick={handleDeleteApplicationBulk} disabled={bulkSaving} className="whitespace-nowrap">
                  삭제
                </Button>
                <Button size="sm" onClick={handleTaxInvoiceBulk} disabled={bulkSaving} className="bg-teal-500 hover:bg-teal-400 text-white whitespace-nowrap">
                  {bulkSaving ? '처리 중...' : '계산서 작성'}
                </Button>
                <Button size="sm" onClick={handleSaveToCustomerBulk} disabled={bulkSaving} className="bg-green-800 text-white hover:bg-green-900 whitespace-nowrap">
                  {bulkSaving ? '처리 중...' : '고객 DB 저장 →'}
                </Button>
              </div>
            </div>
          )}

          {/* 캘린더 뷰 */}
          {viewMode === 'calendar' && !showUnassigned && (
            <AppCalendarView
              selectedMonth={selectedMonth}
              applications={filteredApps}
              onSelectApp={app => { handleSelect(app); setCalDate(null) }}
              calDate={calDate}
              calDateApps={calDateApps}
              onDaySelect={(d, apps) => { setCalDate(d); setCalDateApps(apps) }}
              onDayClose={() => setCalDate(null)}
              allDates={allCalDates}
              onDateChange={d => {
                const dayApps = filteredApps.filter(a => a.construction_date?.slice(0, 10) === d)
                setCalDate(d)
                setCalDateApps(dayApps)
              }}
            />
          )}

          {/* 목록 테이블 */}
          {(viewMode === 'list' || showUnassigned) && (
          <div ref={listContainerRef} className="bg-surface rounded-xl border border-border overflow-auto flex-1 flex flex-col overscroll-contain min-h-0">
            {loading ? (
              <LoadingSpinner />
            ) : filteredApps.length === 0 ? (
              <div className="py-20 text-center text-text-tertiary text-sm">신청서가 없습니다.</div>
            ) : (() => {
              const rows = filteredApps
              const totalSum = rows.reduce((s, a) => s + rowTotal(a), 0)
              return (
                <table className="w-full text-sm">
                  <thead className="bg-surface-sunken border-b border-border sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-3 w-8">
                        <input type="checkbox"
                          checked={rows.length > 0 && rows.every(r => checkedIds.includes(r.id))}
                          onChange={e => {
                            if (e.target.checked) setCheckedIds(prev => Array.from(new Set(prev.concat(rows.map(r => r.id)))))
                            else setCheckedIds(prev => prev.filter(id => !rows.some(r => r.id === id)))
                          }}
                          className="accent-blue-600 cursor-pointer" />
                      </th>
                      {[
                        { label: '시공일자', field: 'construction_date' as SortField },
                        { label: '업체명 / 주소', field: 'business_name' as SortField },
                        { label: '케어범위', field: null },
                        { label: '대표자', field: 'owner_name' as SortField },
                        { label: '담당자', field: null },
                        { label: '결제방법', field: 'payment_method' as SortField },
                        { label: '총액', field: 'total_amount' as SortField },
                        { label: '계약상태', field: 'status' as SortField },
                        { label: '최근알림', field: null },
                      ].map(({ label, field }) => (
                        <th key={label}
                          onClick={field ? () => toggleSort(field) : undefined}
                          className={`text-left px-3 py-3 text-xs font-semibold text-text-secondary whitespace-nowrap ${field ? 'cursor-pointer hover:text-text-primary select-none' : ''}`}>
                          {label}
                          {field && sortField === field && <span className="ml-1">{sortDir === 'desc' ? '↓' : '↑'}</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const weekTotals: Map<string, number> = new Map()
                      for (const app of rows) {
                        if (app.construction_date) {
                          const { key } = getWeekInfo(app.construction_date)
                          weekTotals.set(key, (weekTotals.get(key) ?? 0) + rowTotal(app))
                        }
                      }
                      let lastWeekKey = ''
                      return rows.flatMap(app => {
                        const cells: React.ReactNode[] = []
                        // 주차 헤더 삽입
                        if (app.construction_date) {
                          const { key, label } = getWeekInfo(app.construction_date)
                          if (key !== lastWeekKey) {
                            lastWeekKey = key
                            const weekSum = weekTotals.get(key) ?? 0
                            cells.push(
                              <tr key={`wk-${key}`} className="bg-gradient-to-r from-brand-50 to-indigo-50 border-t-2 border-brand-200">
                                <td colSpan={10} className="px-4 py-1.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-brand-700 tracking-wide">{label}</span>
                                    {weekSum > 0 && (
                                      <span className="text-xs font-bold text-brand-600">
                                        합계 <span className="font-mono">{fmt(weekSum)}</span>원
                                      </span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )
                          }
                        }

                      const lastDbLog = app.notification_log?.[0]
                      const lastLog = lastDbLog ? { type: lastDbLog.type, sentAt: lastDbLog.sent_at, method: lastDbLog.method } : null
                      const notifyCfg = lastLog ? NOTIFY_TYPE_CONFIG[lastLog.type] : null
                      const total = rowTotal(app)
                      const statusCfg = STATUS_CONFIG[app.status]
                      const isSelected = selected?.id === app.id || checkedIds.includes(app.id)
                      const rowBg = isSelected ? 'bg-brand-100' : (statusCfg?.row ?? 'bg-surface')
                      cells.push(
                        <tr key={app.id}
                          ref={el => { rowRefs.current[app.id] = el }}
                          onClick={() => handleSelect(app)}
                          className={`border-b border-border-subtle last:border-0 cursor-pointer hover:brightness-95 transition-all ${rowBg}`}>
                          <td className="px-3 py-2.5 w-8" onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={checkedIds.includes(app.id)}
                              onChange={() => toggleCheck(app.id)}
                              className="accent-blue-600 cursor-pointer" />
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className="font-mono text-xs text-text-secondary">
                              {app.construction_date ? fmtDate(app.construction_date) : <span className="text-text-tertiary">미설정</span>}
                            </span>
                            {app.construction_date?.slice(0, 10) === todayStr && (
                              <span className="ml-1.5 text-xs font-bold text-brand-600 bg-brand-100 px-1.5 py-0.5 rounded-full">오늘</span>
                            )}
                            {app.construction_time && (
                              <div>
                                <span className="text-xs text-text-tertiary">
                                  {app.construction_time.slice(0, 5)}시
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 max-w-[140px]">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-text-primary truncate text-sm leading-tight">{app.business_name}</span>
                              {app.created_at > sevenDaysAgoStr && !viewedNewIds.has(app.id) && (
                                <span className="text-[9px] font-bold bg-red-500 text-white px-1 py-0.5 rounded-full shrink-0">NEW</span>
                              )}
                            </div>
                            {app.address && (
                              <div className="text-xs text-text-tertiary truncate mt-0.5 leading-tight">{app.address}</div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 max-w-[130px]">
                            {app.care_scope ? (
                              <span className="text-xs text-text-secondary line-clamp-2 leading-tight">{app.care_scope}</span>
                            ) : <span className="text-text-tertiary text-xs">-</span>}
                          </td>
                          <td className="px-3 py-2.5 text-text-primary text-xs whitespace-nowrap">{app.owner_name}</td>
                          <td className="px-3 py-2.5 text-text-secondary text-xs whitespace-nowrap">
                            {users.find(u => u.id === app.assigned_to)?.name ?? <span className="text-text-tertiary">미배정</span>}
                          </td>
                          <td className="px-3 py-2.5 text-text-secondary text-xs whitespace-nowrap">{app.payment_method ?? '-'}</td>
                          <td className="px-3 py-2.5 text-xs font-mono font-semibold text-text-primary whitespace-nowrap">
                            {total > 0 ? <>{fmt(total)}<span className="text-text-tertiary font-normal">원</span></> : <span className="text-text-tertiary">-</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${statusCfg?.badge ?? 'bg-surface-sunken text-text-secondary'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${statusCfg?.dot ?? 'bg-text-tertiary'} shrink-0`} />
                              {app.status}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            {lastLog && notifyCfg ? (
                              <div className="flex items-center gap-1 flex-wrap">
                                {lastLog.method === 'auto' && (
                                  <span className="text-xs px-1 py-0.5 bg-indigo-100 text-indigo-500 rounded font-medium leading-none">[자동]</span>
                                )}
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${notifyCfg.badge}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${notifyCfg.dot} shrink-0`} />
                                  <span className="truncate max-w-[80px]">{lastLog.type.replace('알림', '')}</span>
                                </span>
                              </div>
                            ) : <span className="text-text-tertiary text-xs">-</span>}
                          </td>
                        </tr>
                      )
                      return cells
                    })
                  })()}
                  </tbody>
                </table>
              )
            })()}
            {/* 합계 행 — 리스트 하단 */}
            {!loading && filteredApps.length > 0 && (
              <div className="border-t border-border px-4 py-2.5 flex items-center justify-between bg-surface-sunken">
                <span className="text-xs text-text-secondary">
                  합계 <span className="text-text-tertiary font-normal">({filteredApps.length}건)</span>
                </span>
                <span className="text-sm font-bold font-mono text-text-primary">
                  {fmt(filteredApps
                    .filter(a => !['신규','견적발송','방문견적','예약취소','예약금환급완료'].includes(a.status))
                    .reduce((s, a) => s + rowTotal(a), 0))}
                  <span className="text-text-secondary font-normal text-xs">원</span>
                </span>
              </div>
            )}
          </div>
          )}

        </div>

        {/* ── 우측: 상세 패널 (오버레이) ── */}
        {selected && (
          <>
            {/* 백드롭 - 패널 외 클릭 시 닫힘 (PC: absolute, 모바일: fixed) */}
            <div className="fixed inset-0 z-[55] md:absolute md:inset-0 md:z-10" onClick={closePanel} />
          <div className="fixed inset-x-0 top-0 bottom-0 z-[60] md:absolute md:inset-x-auto md:right-0 md:top-0 md:bottom-0 md:w-[480px] bg-surface md:rounded-xl md:border md:border-border shadow-2xl overflow-y-auto overscroll-contain">
            {/* 헤더 */}
            <div className="p-4 border-b border-border-subtle flex items-start justify-between gap-2 sticky top-0 bg-surface z-10">
              <div>
                <h2 className="font-bold text-text-primary">{selected.business_name}</h2>
                <p className="text-xs text-text-tertiary mt-0.5">신청일: {new Date(selected.created_at).toLocaleString('ko-KR')}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={closePanel} className="text-text-tertiary hover:text-text-secondary text-lg leading-none">✕</button>
              </div>
            </div>

            <div className="p-4 space-y-5">
              {/* 계약상태 */}
              <Section title="계약상태">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_CONFIG[selected.status]?.dot ?? 'bg-text-tertiary'}`} />
                  <select
                    value={selected.status}
                    disabled={saving}
                    onChange={e => quickSave({ status: e.target.value as ApplicationStatus })}
                    className={`flex-1 border rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 ${STATUS_CONFIG[selected.status]?.badge ?? 'bg-surface-sunken text-text-secondary'}`}
                  >
                    {(Object.keys(STATUS_CONFIG) as ApplicationStatus[]).map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </Section>

              {/* 서비스 유형 */}
              <Section title="서비스 유형">
                <div className="flex gap-1.5 flex-wrap">
                  {SERVICE_TYPES.map(t => (
                    <button key={t} disabled={saving}
                      onClick={() => quickSave({ service_type: t })}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        (selected.service_type ?? '1회성케어') === t ? 'bg-brand-600 text-white' : 'bg-surface-sunken text-text-secondary hover:bg-surface-sunken'
                      }`}>{t}</button>
                  ))}
                </div>
                <div className="flex gap-1.5 flex-wrap mt-2">
                  {(['호의', '보통', '블랙'] as const).map(d => {
                    const style = d === '호의' ? 'bg-sky-100 text-sky-700' : d === '블랙' ? 'bg-red-100 text-red-700' : 'bg-surface-sunken text-text-secondary'
                    const isActive = (selected.disposition ?? '보통') === d
                    return (
                      <button key={d} disabled={saving}
                        onClick={() => quickSave({ disposition: d })}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          isActive ? `${style} ring-2 ring-offset-1 ring-current` : 'bg-surface-sunken text-text-secondary hover:bg-surface-sunken'
                        }`}>{d}</button>
                    )
                  })}
                </div>
              </Section>

              {/* 시공일자 */}
              <Section title="시공일자">
                <input type="date" value={constructionDate} onChange={e => setConstructionDate(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </Section>

              {/* 담당자 + 작업자 */}
              <Section title="담당자 / 작업자">
                <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface mb-2">
                  <option value="">담당자 미배정</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.role === 'admin' ? '관리자' : '직원'})</option>
                  ))}
                </select>
                {/* 작업자 다중선택 */}
                <div className="relative">
                  <button type="button"
                    onClick={() => setWorkerDropdownOpen(o => !o)}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm text-left bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between">
                    <span className="flex flex-wrap gap-1">
                      {selectedWorkerIds.length === 0
                        ? <span className="text-text-tertiary">작업자 선택 (복수 가능)</span>
                        : selectedWorkerIds.map(wid => {
                            const w = workers.find(x => x.id === wid)
                            return w ? (
                              <span key={wid} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs">
                                {w.name}
                                <button type="button" onClick={e => { e.stopPropagation(); handleWorkerToggle(wid) }} className="text-indigo-400 hover:text-indigo-700 leading-none">×</button>
                              </span>
                            ) : null
                          })}
                    </span>
                    <span className="text-text-tertiary text-xs ml-1 shrink-0">{workerDropdownOpen ? '▲' : '▼'}</span>
                  </button>
                  {workerDropdownOpen && (
                    <div className="absolute z-20 mt-1 w-full bg-surface border border-border rounded-xl shadow-lg max-h-52 overflow-y-auto">
                      {workers.length === 0
                        ? <p className="px-3 py-4 text-xs text-text-tertiary text-center">직원 관리에서 작업자를 먼저 추가하세요</p>
                        : workers.map(w => {
                          const checked = selectedWorkerIds.includes(w.id)
                          const EMP_COLOR: Record<string, string> = { '정직원': 'bg-green-100 text-green-700', '인턴': 'bg-red-100 text-red-700', '일용직': 'bg-yellow-100 text-yellow-700' }
                          return (
                            <button key={w.id} type="button"
                              onClick={() => handleWorkerToggle(w.id)}
                              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-surface-sunken transition-colors ${checked ? 'bg-indigo-50' : ''}`}>
                              <span className={`w-4 h-4 rounded border flex items-center justify-center text-xs shrink-0 ${checked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-border'}`}>
                                {checked && '✓'}
                              </span>
                              <span className="font-medium text-text-primary flex-1">{w.name}</span>
                              {w.employment_type && (
                                <span className={`text-xs px-1.5 py-0.5 rounded ${EMP_COLOR[w.employment_type] ?? 'bg-surface-sunken text-text-secondary'}`}>{w.employment_type}</span>
                              )}
                              {w.phone && <span className="text-xs text-text-tertiary">{w.phone}</span>}
                            </button>
                          )
                        })}
                    </div>
                  )}
                </div>
              </Section>

              {/* 사전미팅 */}
              <Section title="사전미팅">
                <div className="bg-surface border border-purple-100 rounded-xl p-3 space-y-2">
                  <p className="text-xs text-text-secondary">사전 미팅 일정을 설정합니다.</p>
                  <input
                    type="datetime-local"
                    value={preMeetingAt}
                    onChange={e => setPreMeetingAt(e.target.value)}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                  {preMeetingAt && (
                    <div className="text-xs text-purple-700 bg-purple-50 rounded p-2">
                      미팅 일정: {new Date(preMeetingAt).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                  {preMeetingAt && (
                    <button onClick={() => setPreMeetingAt('')} className="text-xs text-text-tertiary hover:text-red-500">일정 삭제</button>
                  )}
                </div>
              </Section>

              {/* 일반정보 */}
              <Section title="일반정보">
                <div className="space-y-2">
                  <EditRow label="고객명" value={ownerName} onChange={setOwnerName} />
                  <EditRow label="업체명" value={businessNameEdit} onChange={setBusinessNameEdit} />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-secondary w-20 shrink-0">연락처</span>
                    <div className="flex flex-1 gap-1">
                      <input value={phone} onChange={e => setPhone(e.target.value)}
                        className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <a href={`tel:${phone}`} className="px-2 py-1.5 text-xs bg-brand-50 text-brand-600 rounded-lg hover:bg-brand-100"><Phone size={14} /></a>
                      <button onClick={() => copyText(phone, '연락처')} className="px-2 py-1.5 text-xs bg-surface-sunken rounded-lg hover:bg-surface-sunken"><ClipboardList size={14} /></button>
                    </div>
                  </div>
                  <EditRow label="이메일" value={email} onChange={setEmail} />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-secondary w-20 shrink-0">주소</span>
                    <div className="flex flex-1 gap-1">
                      <input value={address} onChange={e => setAddress(e.target.value)}
                        className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <button onClick={() => setMapAddress(address)}
                        className="px-2 py-1.5 text-xs bg-green-50 text-green-700 rounded-lg hover:bg-green-100 shrink-0"><MapIcon size={14} /></button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-secondary w-20 shrink-0">영업시간</span>
                    <div className="flex items-center gap-1 flex-1">
                      <TimePicker24h value={businessHoursStart} onChange={setBusinessHoursStart} placeholder="시작" className="flex-1" />
                      <span className="text-text-tertiary text-xs">~</span>
                      <TimePicker24h value={businessHoursEnd} onChange={setBusinessHoursEnd} placeholder="종료" className="flex-1" />
                    </div>
                  </div>
                </div>
              </Section>

              {/* 작업장정보 */}
              <Section title="작업장정보">
                <div className="border-2 border-green-200 rounded-xl p-3 space-y-2 bg-green-50/30">
                  <EditRow label="주차" value={parking} onChange={setParking} />
                  <EditRow label="건물출입" value={buildingAccess} onChange={setBuildingAccess} />
                  <EditRow label="엘리베이터" value={elevator} onChange={setElevator} />
                  <EditRow label="출입방법" value={accessMethod} onChange={setAccessMethod} />
                </div>
              </Section>

              {/* 시공정보 */}
              <Section title="시공정보">
                <div className="border-2 border-green-200 rounded-xl p-3 space-y-2 bg-green-50/30">
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-text-secondary w-20 shrink-0 pt-1.5">케어범위</span>
                    <div className="flex-1">
                      <textarea value={careScope} onChange={e => setCareScope(e.target.value)} rows={3}
                        placeholder="예) - 후드청소&#10;- 덕트청소&#10;- 계단청소"
                        className="w-full border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 resize-none text-text-primary" />
                      <p className="text-[10px] text-text-tertiary mt-0.5">범위는 1건씩 앞에 - 를 붙여서 작성</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-text-secondary w-20 shrink-0 pt-1.5">고객요청사항</span>
                    <textarea value={requestNotes} onChange={e => setRequestNotes(e.target.value)} rows={2}
                      className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 resize-none text-text-primary" />
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-text-secondary w-20 shrink-0 pt-1.5">관리자 요청</span>
                    <textarea value={adminRequestNotes} onChange={e => setAdminRequestNotes(e.target.value)} rows={2}
                      placeholder="직원에게 전달할 요청사항을 입력하세요..."
                      className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 resize-none text-text-primary" />
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-text-secondary w-20 shrink-0 pt-1.5">관리자메모</span>
                    <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} rows={3}
                      placeholder="내부 메모를 입력하세요..."
                      className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 resize-none text-text-primary" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-secondary w-20 shrink-0">시공시간</span>
                    <TimePicker24h value={constructionTime} onChange={setConstructionTime} placeholder="시작 시간 선택" className="flex-1" />
                  </div>
                </div>
              </Section>

              {/* 결제정보 */}
              <Section title="결제정보">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-secondary w-20 shrink-0">결제방법</span>
                    <select value={paymentMethod} onChange={e => handlePaymentMethodChange(e.target.value)}
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
                      <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)}
                        className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
                      <button onClick={() => copyText(accountNumber, '계좌번호')} className="px-2 py-1.5 text-xs bg-surface-sunken rounded-lg hover:bg-surface-sunken"><ClipboardList size={14} /></button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-secondary w-20 shrink-0">사업자번호</span>
                    <div className="flex flex-1 gap-1">
                      <input value={businessNumber} onChange={e => setBusinessNumber(e.target.value)}
                        className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
                      <button onClick={() => copyText(businessNumber, '사업자번호')} className="px-2 py-1.5 text-xs bg-surface-sunken rounded-lg hover:bg-surface-sunken"><ClipboardList size={14} /></button>
                    </div>
                  </div>
                </div>
              </Section>

              {/* 금액 정보 */}
              <Section title="금액 정보">
                {isCashNoVat && (
                  <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs text-amber-700 font-semibold flex items-center gap-1"><Banknote size={14} /> 현금 결제 — 부가세 미적용</p>
                  </div>
                )}
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <AmountInput label="예약금" value={deposit} onChange={setDeposit} />
                    <AmountInput label="공급가액" value={supplyAmount} onChange={handleSupplyChange} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <AmountInput
                      label="부가세" hint={isCashNoVat ? '(비적용)' : '(자동 10%)'}
                      value={isCashNoVat ? '0' : vat}
                      onChange={handleVatChange} disabled={isCashNoVat}
                    />
                    <div>
                      <label className="text-xs text-text-secondary mb-1 block">잔금 <span className="text-green-500">(자동계산)</span></label>
                      <div className={`w-full border rounded-lg px-3 py-2 text-sm font-semibold ${
                        computedBalance < 0 ? 'border-red-200 bg-red-50 text-red-600' : 'border-border-subtle bg-surface-sunken text-text-primary'
                      }`}>{fmt(computedBalance)}원</div>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-border-subtle flex justify-between text-xs">
                    <span className="text-text-secondary">총액 (공급가액 + 부가세)</span>
                    <span className="font-bold text-text-primary">{fmt(totalAmount)}원</span>
                  </div>
                </div>
              </Section>

              {/* 알림 발송 */}
              <Section title="알림 발송">
                <div className="flex gap-2 mb-3">
                  <select value={notifyType} onChange={e => setNotifyType(e.target.value)}
                    className="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-surface">
                    <option value="">알림 유형 선택...</option>
                    {NOTIFICATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <Button onClick={handleNotify} disabled={sending || !notifyType} className="bg-orange-500 hover:bg-orange-600 text-white whitespace-nowrap">
                    {sending ? '발송 중...' : <><Megaphone size={14} /> 발송</>}
                  </Button>
                </div>
                {notifyType && (() => {
                  const isWorker = notifyType === '작업자 일정 안내' || notifyType === '작업자 자세한 일정 안내'
                  const target = isWorker
                    ? (selectedWorkerIds.length > 0
                      ? selectedWorkerIds.map(wid => {
                          const w = workers.find(w => w.id === wid)
                          return w ? `${w.name} (${w.phone ?? '번호 없음'})` : wid
                        }).join(', ')
                      : '배정된 작업자 없음')
                    : phone
                  return (
                    <div className={`mb-3 px-3 py-2 rounded-lg text-xs ${isWorker ? 'bg-slate-50 border border-slate-200 text-slate-700' : 'bg-orange-50 border border-orange-200 text-orange-700'}`}>
                      선택: <span className="font-semibold">{notifyType}</span> → {target}
                    </div>
                  )
                })()}
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
                              {/* P2-31: 자동/수동 구분 태그 */}
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
              </Section>

              {/* 쇼핑 목록 */}
              <ShoppingItemsSection
                applicationId={selected.id}
                businessName={selected.business_name}
                serviceType={selected.service_type ?? null}
                constructionDate={selected.construction_date ?? null}
              />

              {/* Google Drive 폴더 */}
              <Section title="Google Drive 폴더">
                <div className="space-y-2">
                  {driveConfirming ? (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
                      <p className="text-xs text-green-800 font-medium flex items-center gap-1"><FolderOpen size={14} /> <span className="font-bold">{savedDriveFolder?.name}</span> 에 생성할까요?</p>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={executeDriveCreateWithSaved} disabled={driveCreating} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
                          이 위치에 생성
                        </Button>
                        <Button variant="secondary" size="sm" onClick={executeDriveCreateWithPicker} disabled={driveCreating} className="flex-1 text-green-700 border border-green-300 hover:bg-green-50">
                          위치 변경
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button onClick={handleDriveCreate} disabled={driveCreating} className="w-full bg-green-600 hover:bg-green-700 text-white">
                      <Folder size={14} /><span>{driveCreating ? '생성 중...' : (selected?.drive_folder_url ? '폴더 위치 변경' : '폴더 생성')}</span>
                    </Button>
                  )}
                  <button
                    onClick={() => {
                      if (selected.drive_folder_url) {
                        window.open(selected.drive_folder_url, '_blank')
                      } else {
                        toast.error('폴더를 먼저 생성해주세요')
                      }
                    }}
                    className={`flex items-center gap-2 text-xs ${selected.drive_folder_url ? 'text-green-600 hover:text-green-700' : 'text-text-tertiary cursor-not-allowed'}`}
                  >
                    <Link size={14} /><span className="truncate">Drive 폴더 열기</span>
                  </button>
                </div>
              </Section>

              {/* Notion 링크 */}
              {selected.notion_page_id && (
                <a href={`https://notion.so/${selected.notion_page_id.replace(/-/g, '')}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary">
                  <PenLine size={14} /> Notion에서 보기
                </a>
              )}

              {/* 견적서 관리 이동 */}
              <Section title="견적서">
                <Button onClick={() => {
                  sessionStorage.setItem('quotes_appId', selected.id)
                  router.push('/admin/quotes')
                }} className="w-full">
                  <FileText size={14} />
                  <span>견적서 관리로 이동</span>
                </Button>
                <p className="text-[11px] text-text-tertiary mt-2 text-center">
                  견적서 탭에서 고객이 자동 선택되고 케어범위 항목이 자동 입력됩니다
                </p>
              </Section>

              {/* 전체 저장 */}
              <Button onClick={handleSave} disabled={saving} size="lg" className="w-full">
                {saving ? '저장 중...' : <><Save size={14} /> 전체 저장</>}
              </Button>
            </div>
          </div>
          </>
        )}
      </div>

    </>
  )
}
