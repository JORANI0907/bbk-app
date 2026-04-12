'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import toast from 'react-hot-toast'

import { WorkPanel } from '@/components/admin/WorkPanel'
import { openGoogleDrive } from '@/lib/mapUtils'
import { useModalBackButton } from '@/hooks/useModalBackButton'
import { MonthNavigator } from '@/components/MonthNavigator'
import { LoadingSpinner } from '@/components/admin/LoadingSpinner'
import { MapSelectorModal } from '@/components/MapSelectorModal'

// ─── 타입 ──────────────────────────────────────────────────────

interface Application {
  id: string
  business_name: string
  owner_name: string
  phone: string
  email: string | null
  address: string | null
  status: string
  service_type: string | null
  assigned_to: string | null
  construction_date: string | null
  supply_amount: number | null
  vat: number | null
  payment_method: string | null
  business_hours_start: string | null
  business_hours_end: string | null
  elevator: string | null
  building_access: string | null
  parking: string | null
  access_method: string | null
  request_notes: string | null
  care_scope: string | null
  business_number: string | null
  account_number: string | null
  drive_folder_url: string | null
  // 작업 추적
  work_status: string | null
  work_started_at: string | null
  work_completed_at: string | null
  customer_memo: string | null
  internal_memo: string | null
  notification_send_at: string | null
  notification_sent_at: string | null
}

interface User { id: string; name: string; role: string }
interface Worker { id: string; name: string; employment_type: string | null }
interface WorkAssignment { id: string; worker_id: string; application_id: string | null }
interface SessionUser { userId: string; name: string; role: string }

// ─── 유틸 ──────────────────────────────────────────────────────

const currentMonth = () => new Date().toISOString().slice(0, 7)

/**
 * 배정관리 "오늘" 기준: 낮 12시 이후에는 다음날을 오늘로 취급
 * (새벽 작업 특성상 낮 12시 이후부터 다음날 일정이 활성화)
 */
function getScheduleToday(): string {
  const now = new Date()
  if (now.getHours() >= 12) {
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    return tomorrow.toISOString().slice(0, 10)
  }
  return now.toISOString().slice(0, 10)
}

const DOW_KO = ['일', '월', '화', '수', '목', '금', '토']

/** 26.03.31(화) 형식 */
function fmtDate(d: string | null): string {
  if (!d) return '-'
  const date = new Date(d.slice(0, 10) + 'T00:00:00')
  const yy = String(date.getFullYear()).slice(2)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const dow = DOW_KO[date.getDay()]
  return `${yy}.${mm}.${dd}(${dow})`
}

/** 주차 레이블 계산 - "N월 N주차 (M.D 월 ~ M.D 일)" 형식 */
function getWeekLabel(dateStr: string): { key: string; label: string } {
  const date = new Date(dateStr.slice(0, 10) + 'T00:00:00')

  // 해당 주의 월요일 구하기 (일=0 기준으로 조정)
  const dayOfWeek = date.getDay() // 0=일, 1=월 ... 6=토
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const monday = new Date(date)
  monday.setDate(date.getDate() - daysFromMonday)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  // 월요일 기준으로 몇 번째 주인지 (월요일의 날짜를 7로 나눠 올림)
  const weekOfMonth = Math.ceil(monday.getDate() / 7)

  // 월 기준은 날짜(date)의 월을 사용
  const month = date.getMonth() + 1

  const mondayStr = `${monday.getMonth() + 1}.${monday.getDate()}`
  const sundayStr = `${sunday.getMonth() + 1}.${sunday.getDate()}`
  const key = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
  const label = `${month}월 ${weekOfMonth}주차 (${mondayStr} 월 ~ ${sundayStr} 일)`

  return { key, label }
}

const STATUS_CONFIG: Record<string, { badge: string; dot: string }> = {
  '신규':     { badge: 'bg-blue-100 text-blue-700',       dot: 'bg-blue-500' },
  '검토중':   { badge: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-500' },
  '계약완료': { badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  '보류':     { badge: 'bg-gray-100 text-gray-600',       dot: 'bg-gray-400' },
  '거절':     { badge: 'bg-red-100 text-red-700',         dot: 'bg-red-500' },
}

/** 서비스 유형 뱃지 색상 */
const SERVICE_TYPE_CONFIG: Record<string, string> = {
  '1회성케어':  'bg-gray-100 text-gray-700',
  '정기딥케어': 'bg-blue-100 text-blue-700',
  '정기엔드케어': 'bg-purple-100 text-purple-700',
}

const SERVICE_TYPE_OPTIONS = ['전체보기', '1회성케어', '정기딥케어', '정기엔드케어']

async function fetchSession(): Promise<SessionUser | null> {
  try {
    const res = await fetch('/api/auth/me')
    const data = await res.json()
    return data.user ?? null
  } catch { return null }
}

// ─── 날짜 리스트 패널 ──────────────────────────────────────────

function DayListPanel({
  dateStr, apps, workers, appWorkerMap, onSelectApp, onClose, allDates, onDateChange,
}: {
  dateStr: string
  apps: Application[]
  workers: Worker[]
  appWorkerMap: Record<string, string[]>
  onSelectApp: (app: Application) => void
  onClose: () => void
  allDates: string[]
  onDateChange: (date: string) => void
}) {
  const touchStartX = useRef<number | null>(null)
  const parts = dateStr.split('-').map(Number)
  const m = parts[1]
  const d = parts[2]
  const dow = new Date(dateStr + 'T12:00:00').getDay()
  const dayLabel = ['일', '월', '화', '수', '목', '금', '토'][dow]

  const currentIdx = allDates.indexOf(dateStr)
  const hasPrev = currentIdx > 0
  const hasNext = currentIdx < allDates.length - 1

  const goTo = (delta: number) => {
    const newIdx = currentIdx + delta
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
    if (Math.abs(delta) > 40) goTo(delta > 0 ? 1 : -1)
    touchStartX.current = null
  }

  return (
    <div className="fixed inset-0 z-[55] bg-black/40 flex items-end md:items-center justify-center"
      onClick={onClose}>
      <div
        className="bg-white w-full max-w-md rounded-t-2xl md:rounded-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: 'calc(80vh - env(safe-area-inset-bottom))' }}
        onClick={e => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <button
            onClick={() => goTo(-1)}
            disabled={!hasPrev}
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${hasPrev ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-200 cursor-not-allowed'}`}
          >
            ‹
          </button>
          <div className="text-center">
            <h3 className="font-bold text-gray-900">{m}월 {d}일 ({dayLabel})</h3>
            <p className="text-xs text-gray-400">{apps.length}건</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => goTo(1)}
              disabled={!hasNext}
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${hasNext ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-200 cursor-not-allowed'}`}
            >
              ›
            </button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-3 flex flex-col gap-2 pb-6">
          {apps.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">이 날짜에 일정이 없습니다.</p>
          ) : (
            apps.map(app => {
              const workerNames = (appWorkerMap[app.id] ?? [])
                .map(wid => workers.find(w => w.id === wid)?.name)
                .filter((n): n is string => !!n)
                .join(' · ')
              const cfg = STATUS_CONFIG[app.status] ?? STATUS_CONFIG['신규']
              return (
                <button key={app.id}
                  onClick={() => { onSelectApp(app); onClose() }}
                  className="text-left bg-gray-50 hover:bg-blue-50 border border-gray-100 hover:border-blue-200 rounded-xl p-3 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                    <span className="font-semibold text-gray-900 text-sm">{app.business_name}</span>
                    <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full shrink-0 ${cfg.badge}`}>{app.status}</span>
                  </div>
                  <p className="text-xs text-gray-500 ml-4">{app.owner_name}</p>
                  {app.address && (
                    <p className="text-[11px] text-gray-400 truncate ml-4 mt-0.5">{app.address}</p>
                  )}
                  {app.care_scope && (
                    <p className="text-[11px] text-blue-500 ml-4 mt-0.5 line-clamp-1">{app.care_scope}</p>
                  )}
                  {workerNames && (
                    <p className="text-[11px] text-indigo-500 ml-4 mt-0.5">{workerNames}</p>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

// ─── 캘린더 그리드 ─────────────────────────────────────────────

function CalendarGrid({
  year, month, applications, onDaySelect,
}: {
  year: number
  month: number
  applications: Application[]
  onDaySelect: (dateStr: string, apps: Application[]) => void
}) {
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

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const DAYS = ['일', '월', '화', '수', '목', '금', '토']

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-gray-100">
        {DAYS.map(d => (
          <div key={d} className={`text-center py-2.5 text-xs font-semibold
            ${d === '일' ? 'text-red-500' : d === '토' ? 'text-blue-500' : 'text-gray-500'}`}>
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 auto-rows-[5rem] sm:auto-rows-[7rem]">
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} className="border-r border-b border-gray-50 bg-gray-50/40" />
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const apps = dayMap[dateStr] ?? []
          const isToday = dateStr === todayStr
          const dow = (firstDay + day - 1) % 7
          const hasApps = apps.length > 0

          return (
            <div
              key={day}
              onClick={() => hasApps && onDaySelect(dateStr, apps)}
              className={`border-r border-b border-gray-50 p-1.5 flex flex-col gap-0.5
                ${isToday ? 'bg-blue-50' : (dow === 0 || dow === 6) ? 'bg-gray-50/50' : ''}
                ${hasApps ? 'cursor-pointer hover:bg-indigo-50/40 transition-colors' : ''}`}
            >
              <div className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full shrink-0
                ${isToday ? 'bg-blue-600 text-white' : dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-gray-700'}`}>
                {day}
              </div>
              <div className="flex flex-col gap-0.5 overflow-hidden">
                {apps.slice(0, 3).map(app => {
                  const cfg = STATUS_CONFIG[app.status] ?? STATUS_CONFIG['신규']
                  return (
                    <div key={app.id}
                      className="px-1 py-0.5 rounded-md bg-indigo-50 border border-indigo-100/80">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className={`w-1 h-1 rounded-full shrink-0 ${cfg.dot}`} />
                        <span className="text-[9px] text-indigo-800 font-semibold truncate leading-tight">{app.business_name}</span>
                      </div>
                    </div>
                  )
                })}
                {apps.length > 3 && (
                  <div className="text-[10px] text-gray-400 px-1 font-medium">+{apps.length - 3}건</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── 상세 패널 ────────────────────────────────────────────────

function DetailPanel({
  app, users, workers, appWorkerMap, isAdmin, onClose, onAppUpdate, onDelete, onOpenMap,
}: {
  app: Application
  users: User[]
  workers: Worker[]
  appWorkerMap: Record<string, string[]>
  isAdmin: boolean
  onClose: () => void
  onAppUpdate: (updates: Partial<Application>) => void
  onDelete: () => void
  onOpenMap: (addr: string) => void
}) {
  const [showAccount, setShowAccount] = useState(false)
  const [showBizNum, setShowBizNum] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showWorkPanel, setShowWorkPanel] = useState(
    app.work_status === 'in_progress' || app.work_status === 'completed'
  )

  async function handleDelete() {
    if (!confirm(`"${app.business_name}" 일정을 삭제하시겠습니까?\n서비스 신청 내용도 함께 삭제됩니다.`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/applications?id=${app.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error)
      onDelete()
    } catch (e) {
      alert(String(e))
      setDeleting(false)
    }
  }

  const manager = users.find(u => u.id === app.assigned_to)
  const workerNames = (appWorkerMap[app.id] ?? [])
    .map(wid => workers.find(w => w.id === wid)?.name)
    .filter((n): n is string => !!n)

  const cfg = STATUS_CONFIG[app.status] ?? STATUS_CONFIG['신규']

  const mask = (val: string | null) =>
    val ? val.slice(0, 4) + '****' + val.slice(-2) : '-'

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex items-start gap-2 py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-500 shrink-0 w-20">{label}</span>
      <span className="text-xs text-gray-800 flex-1 text-right">{value ?? '-'}</span>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" onClick={onClose}>
      <div
        className="relative h-full w-full md:max-w-sm bg-white shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="sticky top-0 bg-white z-10 px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-2 shrink-0">
          <div>
            <h2 className="font-bold text-gray-900 text-base leading-tight">{app.business_name}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.badge}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                {app.status}
              </span>
              <span className="text-xs text-gray-400">{fmtDate(app.construction_date)}</span>
              {app.service_type && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${SERVICE_TYPE_CONFIG[app.service_type] ?? 'bg-gray-100 text-gray-700'}`}>
                  {app.service_type}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 mt-0.5">
            {isAdmin && (
              <button onClick={handleDelete} disabled={deleting}
                className="text-xs px-2 py-1 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg transition-colors disabled:opacity-50">
                {deleting ? '삭제 중...' : '삭제'}
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
          </div>
        </div>

        {/* 본문 스크롤 영역 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* 섹션 1 - 일반정보 */}
          <section>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">일반정보</p>
            <div className="bg-gray-50 rounded-xl px-3 py-1 space-y-0">
              <Row label="고객명" value={app.owner_name} />
              <Row label="업체명" value={app.business_name} />
              <Row label="연락처" value={
                app.phone ? (
                  <div className="flex items-center gap-1 justify-end">
                    <span>{app.phone}</span>
                    <a href={`tel:${app.phone}`} className="px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded text-xs hover:bg-blue-200">📞</a>
                  </div>
                ) : null
              } />
              {app.email && <Row label="이메일" value={app.email} />}
              <Row label="주소" value={
                app.address ? (
                  <div className="flex items-center gap-1 justify-end min-w-0">
                    <span className="truncate">{app.address}</span>
                    <button
                      onClick={() => onOpenMap(app.address!)}
                      className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs shrink-0 hover:bg-green-200">
                      🗺️
                    </button>
                  </div>
                ) : null
              } />
              {(app.business_hours_start || app.business_hours_end) && (
                <Row label="영업시간" value={`${app.business_hours_start ?? '-'} ~ ${app.business_hours_end ?? '-'}`} />
              )}
            </div>
          </section>

          {/* 배정 정보 */}
          <section>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">배정 정보</p>
            <div className="bg-gray-50 rounded-xl px-3 py-1">
              <Row label="담당자" value={manager?.name ?? '미배정'} />
              <Row label="작업자" value={
                workerNames.length > 0
                  ? <div className="flex flex-wrap gap-1 justify-end">
                      {workerNames.map(n => (
                        <span key={n} className="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded text-xs">{n}</span>
                      ))}
                    </div>
                  : '미배정'
              } />
            </div>
          </section>

          {/* 민감 정보 (관리자만, 블라인드) */}
          {isAdmin && (
            <section>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">사업자 정보</p>
              <div className="bg-gray-50 rounded-xl px-3 py-1">
                <div className="flex items-start gap-2 py-1.5 border-b border-gray-50">
                  <span className="text-xs text-gray-400 shrink-0 w-20">사업자번호</span>
                  <div className="flex items-center gap-1.5 flex-1 justify-end">
                    <span className="text-xs text-gray-800 font-mono">
                      {showBizNum ? (app.business_number ?? '-') : mask(app.business_number)}
                    </span>
                    {app.business_number && (
                      <button onClick={() => setShowBizNum(v => !v)}
                        className="text-xs px-1.5 py-0.5 bg-gray-200 hover:bg-gray-300 text-gray-600 rounded transition-colors">
                        {showBizNum ? '숨김' : '보기'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-2 py-1.5">
                  <span className="text-xs text-gray-400 shrink-0 w-20">계좌번호</span>
                  <div className="flex items-center gap-1.5 flex-1 justify-end">
                    <span className="text-xs text-gray-800 font-mono">
                      {showAccount ? (app.account_number ?? '-') : mask(app.account_number)}
                    </span>
                    {app.account_number && (
                      <button onClick={() => setShowAccount(v => !v)}
                        className="text-xs px-1.5 py-0.5 bg-gray-200 hover:bg-gray-300 text-gray-600 rounded transition-colors">
                        {showAccount ? '숨김' : '보기'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* 섹션 2 - 작업장정보 */}
          <section>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">작업장정보</p>
            <div className="border-2 border-green-200 rounded-xl px-3 py-1 bg-green-50/30">
              {app.parking && <Row label="주차" value={app.parking} />}
              {app.building_access && <Row label="건물출입" value={app.building_access} />}
              {app.elevator && <Row label="엘리베이터" value={app.elevator} />}
              {app.access_method && <Row label="출입방법" value={app.access_method} />}
              {!app.parking && !app.building_access && !app.elevator && !app.access_method && (
                <p className="text-xs text-gray-400 py-2">작업장 정보가 없습니다.</p>
              )}
            </div>
          </section>

          {/* 섹션 3 - 시공정보 */}
          <section>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">시공정보</p>
            <div className="border-2 border-green-200 rounded-xl p-3 bg-green-50/30 space-y-2">
              {app.care_scope && (
                <div>
                  <p className="text-xs text-green-600 font-semibold mb-1">케어 범위</p>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{app.care_scope}</p>
                </div>
              )}
              {app.request_notes && (
                <div>
                  <p className="text-xs text-gray-500 font-semibold mb-1">요청사항</p>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{app.request_notes}</p>
                </div>
              )}
              {!app.care_scope && !app.request_notes && (
                <p className="text-xs text-gray-400">시공 정보가 없습니다.</p>
              )}
            </div>
          </section>

        </div>

        {/* 하단 액션 버튼 영역 */}
        <div className="shrink-0 bg-white border-t border-gray-100 px-5 py-4 space-y-2"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
          {/* 버튼 1: 사진보기 */}
          <button
            onClick={() => app.drive_folder_url
              ? openGoogleDrive(app.drive_folder_url)
              : toast.error('Drive 폴더가 연결되지 않았습니다.')}
            className={`w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
              app.drive_folder_url
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            📷 사진보기 {!app.drive_folder_url && '(폴더 미연결)'}
          </button>

          {/* 버튼 2: 작업 시작/현황 */}
          <button
            onClick={() => setShowWorkPanel(true)}
            className={`w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
              app.work_status === 'completed'
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : app.work_status === 'in_progress'
                ? 'bg-orange-500 hover:bg-orange-600 text-white animate-pulse'
                : 'bg-gray-800 hover:bg-gray-900 text-white'
            }`}
          >
            {app.work_status === 'completed' ? '✅ 작업완료 (상세보기)' :
             app.work_status === 'in_progress' ? '⚡ 작업진행중 (클릭하여 계속)' :
             '▶ 작업 시작'}
          </button>
        </div>

        {/* WorkPanel 전체화면 오버레이 */}
        {showWorkPanel && (
          <div
            className="fixed inset-0 z-[60] bg-white overflow-y-auto flex flex-col"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 80px)' }}
          >
            <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center gap-3 z-10">
              <button
                onClick={() => setShowWorkPanel(false)}
                className="text-gray-500 hover:text-gray-700 text-sm"
              >
                ← 뒤로
              </button>
              <div>
                <h3 className="font-bold text-gray-900">{app.business_name}</h3>
                <p className="text-xs text-gray-400">{fmtDate(app.construction_date)} 작업현황</p>
              </div>
            </div>
            <div className="px-5 py-4">
              <WorkPanel app={app} onUpdate={(updates) => { onAppUpdate(updates) }} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 메인 페이지 ───────────────────────────────────────────────

export default function SchedulePage() {
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null)

  // 월별로 서버에서 새로 불러오는 데이터
  const [applications, setApplications] = useState<Application[]>([])
  const [allAssignments, setAllAssignments] = useState<WorkAssignment[]>([])
  const [loading, setLoading] = useState(true)

  // 한번만 불러오는 참조 데이터
  const [users, setUsers] = useState<User[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [refLoaded, setRefLoaded] = useState(false)

  // 필터 상태
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [selectedMonth, setSelectedMonth] = useState(currentMonth())
  const [personFilter, setPersonFilter] = useState('')
  const [workerFilter, setWorkerFilter] = useState('')
  const [serviceTypeFilter, setServiceTypeFilter] = useState('전체보기')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Application | null>(null)

  // 날짜 클릭 (캘린더 → 날짜 목록 패널)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedDateApps, setSelectedDateApps] = useState<Application[]>([])

  // 지도 앱 선택 모달
  const [mapAddress, setMapAddress] = useState<string | null>(null)

  // 스크롤 복원 (모바일 뒤로가기 후 선택 행으로 돌아오기)
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({})
  const prevSelectedIdRef = useRef<string | null>(null)

  const handleClose = useCallback(() => {
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

  useModalBackButton(!!selected, handleClose)

  // 세션 초기화
  useEffect(() => {
    fetchSession().then(session => {
      setCurrentUser(session)
      if (session && session.role !== 'admin') {
        setPersonFilter(session.userId)
      }
    })
  }, [])

  // 참조 데이터 (users, workers) 최초 1회만 로드
  useEffect(() => {
    Promise.all([
      fetch('/api/admin/users').then(r => r.json()),
      fetch('/api/admin/workers').then(r => r.json()),
    ]).then(([userData, workerData]) => {
      setUsers((userData.users ?? []).filter((u: User) => u.role !== 'customer'))
      setWorkers(workerData.workers ?? [])
      setRefLoaded(true)
    }).catch(() => toast.error('데이터 로드 실패'))
  }, [])

  // 월이 바뀔 때마다 applications + work-assignments 재조회
  const fetchMonthData = useCallback(async (month: string) => {
    setLoading(true)
    try {
      const [appRes, assRes] = await Promise.all([
        fetch(`/api/admin/applications?month=${month}`),
        fetch(`/api/admin/work-assignments?month=${month}`),
      ])
      const appData = await appRes.json()
      const assData = await assRes.json()
      setApplications(appData.applications ?? [])
      setAllAssignments(assData.assignments ?? [])
    } catch {
      toast.error('일정 로드 실패')
      setApplications([])
      setAllAssignments([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMonthData(selectedMonth)
  }, [selectedMonth, fetchMonthData])

  const isAdmin = currentUser?.role === 'admin'

  // 작업자 배정 맵: application_id → worker_id[]
  const appWorkerMap = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const a of allAssignments) {
      if (!a.application_id) continue
      if (!map[a.application_id]) map[a.application_id] = []
      if (!map[a.application_id].includes(a.worker_id)) {
        map[a.application_id].push(a.worker_id)
      }
    }
    return map
  }, [allAssignments])

  // 클라이언트 필터: 담당자 + 작업자 + 서비스 유형
  const filteredApps = useMemo(() => {
    let apps = [...applications]

    // 비관리자: 자신이 담당자이거나 작업자로 배정된 일정만
    if (!isAdmin && currentUser) {
      apps = apps.filter(a =>
        a.assigned_to === currentUser.userId ||
        (appWorkerMap[a.id] ?? []).includes(currentUser.userId)
      )
    } else if (isAdmin) {
      // 담당자 필터 (OR 조건: 해당 worker가 담당자이거나 작업자)
      if (personFilter) {
        apps = apps.filter(a =>
          a.assigned_to === personFilter ||
          (appWorkerMap[a.id] ?? []).includes(personFilter)
        )
      }
      // 작업자 필터 (work_assignments에 해당 worker_id가 있는 일정만)
      if (workerFilter) {
        apps = apps.filter(a => (appWorkerMap[a.id] ?? []).includes(workerFilter))
      }
    }

    // 서비스 유형 필터
    if (serviceTypeFilter && serviceTypeFilter !== '전체보기') {
      apps = apps.filter(a => a.service_type === serviceTypeFilter)
    }

    // 검색
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      apps = apps.filter(a =>
        a.business_name.toLowerCase().includes(q) ||
        a.owner_name.toLowerCase().includes(q) ||
        a.phone.toLowerCase().includes(q) ||
        (a.address ?? '').toLowerCase().includes(q) ||
        (a.care_scope ?? '').toLowerCase().includes(q) ||
        (a.service_type ?? '').toLowerCase().includes(q)
      )
    }

    // 시공일자 내림차순 (최신이 위)
    return apps.sort((a, b) =>
      (b.construction_date ?? '').localeCompare(a.construction_date ?? ''))
  }, [applications, personFilter, workerFilter, serviceTypeFilter, isAdmin, currentUser, appWorkerMap, search])

  const allDates = useMemo(() => {
    const dateSet = new Set<string>()
    for (const app of filteredApps) {
      if (app.construction_date) dateSet.add(app.construction_date.slice(0, 10))
    }
    return Array.from(dateSet).sort()
  }, [filteredApps])

  const [calYear, calMonth] = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number)
    return [y, m - 1]
  }, [selectedMonth])

  const moveMonth = (delta: number) => {
    const [y, m] = selectedMonth.split('-').map(Number)
    const next = new Date(y, m - 1 + delta, 1)
    setSelectedMonth(
      `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
    )
  }

  // 주차 구분선을 포함한 목록 렌더링 아이템 빌드
  type ListItem =
    | { kind: 'week'; key: string; label: string }
    | { kind: 'app'; app: Application }

  const listItems = useMemo((): ListItem[] => {
    const items: ListItem[] = []
    let lastWeekKey = ''
    for (const app of filteredApps) {
      if (app.construction_date) {
        const { key, label } = getWeekLabel(app.construction_date)
        if (key !== lastWeekKey) {
          items.push({ kind: 'week', key, label })
          lastWeekKey = key
        }
      }
      items.push({ kind: 'app', app })
    }
    return items
  }, [filteredApps])

  return (
    <div className="flex flex-col h-full gap-3 overflow-hidden relative">
      {/* 지도 앱 선택 모달 */}
      {mapAddress && (
        <MapSelectorModal address={mapAddress} onClose={() => setMapAddress(null)} />
      )}

      {/* 상세 패널 */}
      {selected && (
        <DetailPanel
          app={selected}
          users={users}
          workers={workers}
          appWorkerMap={appWorkerMap}
          isAdmin={isAdmin}
          onClose={handleClose}
          onOpenMap={(addr) => setMapAddress(addr)}
          onAppUpdate={(updates) => {
            setSelected(prev => prev ? { ...prev, ...updates } : null)
            setApplications(prev => prev.map(a => a.id === selected.id ? { ...a, ...updates } : a))
          }}
          onDelete={() => {
            setApplications(prev => prev.filter(a => a.id !== selected.id))
            setSelected(null)
          }}
        />
      )}

      {/* ── 상단 필터 바 ── */}
      <div className="flex items-center gap-2 flex-wrap shrink-0 bg-white border border-gray-200 rounded-xl px-4 py-3">

        {/* 월 이동 */}
        <MonthNavigator value={selectedMonth} onChange={setSelectedMonth} />

        {/* 서비스 유형 필터 */}
        <select
          value={serviceTypeFilter}
          onChange={e => setServiceTypeFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[110px]"
        >
          {SERVICE_TYPE_OPTIONS.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>

        {/* 담당자 필터 */}
        {isAdmin ? (
          <select
            value={personFilter}
            onChange={e => setPersonFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[110px]"
          >
            <option value="">담당자 전체</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        ) : (
          <span className="px-3 py-1.5 text-xs bg-gray-100 rounded-lg text-gray-600 border border-gray-200">
            {currentUser?.name ?? '내 일정'}
          </span>
        )}

        {/* 작업자 필터 */}
        {isAdmin && (
          <select
            value={workerFilter}
            onChange={e => setWorkerFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[110px]"
          >
            <option value="">작업자 전체</option>
            {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        )}

        {/* 검색 */}
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="업체명, 주소, 케어범위..."
            className="pl-7 pr-7 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">✕</button>
          )}
        </div>

        {/* 건수 */}
        <span className="text-xs text-gray-400 font-medium">
          {loading ? '...' : `${filteredApps.length}건`}
        </span>

        {/* 우측 액션 */}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => fetchMonthData(selectedMonth)}
            className="px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            새로고침
          </button>

          {/* 목록/캘린더 토글 */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              목록
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                viewMode === 'calendar' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              캘린더
            </button>
          </div>
        </div>
      </div>

      {/* ── 컨텐츠 ── */}
      {loading || !refLoaded ? (
        <div className="flex-1 flex items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : viewMode === 'list' ? (

        /* 목록 뷰 */
        <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-auto min-h-0 pb-20 md:pb-0">
          {filteredApps.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-20">
              <span className="text-5xl">📋</span>
              <p className="text-gray-400 text-sm">해당 조건의 일정이 없습니다.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  {['시공일자', '업체명', '케어범위', '대표자', '담당자', '작업자'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {listItems.map(item => {
                  if (item.kind === 'week') {
                    return (
                      <tr key={item.key}>
                        <td colSpan={6} className="px-4 py-1 bg-gray-50">
                          <span className="text-xs text-gray-400 font-medium">{item.label}</span>
                        </td>
                      </tr>
                    )
                  }
                  const app = item.app
                  const workerNames = (appWorkerMap[app.id] ?? [])
                    .map(wid => workers.find(w => w.id === wid)?.name)
                    .filter((n): n is string => !!n)
                  const manager = users.find(u => u.id === app.assigned_to)
                  const isSelected = selected?.id === app.id
                  const todayStr = getScheduleToday()
                  const isToday = app.construction_date?.slice(0, 10) === todayStr
                  const svcColor = app.service_type ? (SERVICE_TYPE_CONFIG[app.service_type] ?? 'bg-gray-100 text-gray-700') : ''
                  return (
                    <tr key={app.id}
                      ref={el => { rowRefs.current[app.id] = el }}
                      onClick={() => isSelected ? handleClose() : setSelected(app)}
                      className={`cursor-pointer hover:bg-blue-50/40 transition-colors ${isSelected ? 'bg-blue-50' : isToday ? 'bg-yellow-50' : ''}`}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-mono text-xs text-gray-500">{fmtDate(app.construction_date)}</span>
                        {isToday && (
                          <span className="ml-1.5 text-xs font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">오늘</span>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-[160px]">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-gray-900 truncate text-sm">{app.business_name}</span>
                          {app.drive_folder_url && <span className="text-blue-400 text-xs shrink-0">📷</span>}
                          {app.work_status === 'in_progress' && (
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse shrink-0" />
                          )}
                          {app.work_status === 'completed' && (
                            <span className="text-xs text-green-600 shrink-0">✓</span>
                          )}
                        </div>
                        {app.address && (
                          <div className="text-xs text-gray-400 truncate mt-0.5">{app.address}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-[130px]">
                        {app.care_scope
                          ? <span className="text-xs text-gray-600 line-clamp-2 leading-tight">{app.care_scope}</span>
                          : <span className="text-gray-300 text-xs">-</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">{app.owner_name}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {manager
                          ? <span className="text-gray-700">{manager.name}</span>
                          : <span className="text-gray-300">미배정</span>}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {workerNames.length > 0
                          ? <div className="flex flex-wrap gap-1">
                              {workerNames.map(name => (
                                <span key={name} className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 py-0.5 rounded-md text-xs whitespace-nowrap">
                                  {name}
                                </span>
                              ))}
                            </div>
                          : <span className="text-gray-300">-</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

      ) : (

        /* 캘린더 뷰 */
        <div className="flex-1 overflow-auto min-h-0 pb-20 md:pb-0">
          <CalendarGrid
            year={calYear}
            month={calMonth}
            applications={filteredApps}
            onDaySelect={(dateStr, apps) => {
              setSelectedDate(dateStr)
              setSelectedDateApps(apps)
            }}
          />
        </div>

      )}

      {/* 날짜 목록 패널 (캘린더 날짜 클릭 시) */}
      {selectedDate && (
        <DayListPanel
          dateStr={selectedDate}
          apps={selectedDateApps}
          workers={workers}
          appWorkerMap={appWorkerMap}
          onSelectApp={app => setSelected(app)}
          onClose={() => setSelectedDate(null)}
          allDates={allDates}
          onDateChange={(newDate) => {
            setSelectedDate(newDate)
            setSelectedDateApps(filteredApps.filter(app => app.construction_date?.slice(0, 10) === newDate))
          }}
        />
      )}
    </div>
  )
}
