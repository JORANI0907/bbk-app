'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import toast from 'react-hot-toast'

// ─── 타입 ──────────────────────────────────────────────────────

interface Application {
  id: string
  business_name: string
  owner_name: string
  status: string
  service_type: string | null
  assigned_to: string | null
  construction_date: string | null
  supply_amount: number | null
  vat: number | null
  drive_folder_url: string | null
}

interface User { id: string; name: string; role: string }
interface Worker { id: string; name: string; employment_type: string | null }
interface WorkAssignment { id: string; worker_id: string; application_id: string | null }
interface SessionUser { userId: string; name: string; role: string }

// ─── 유틸 ──────────────────────────────────────────────────────

const currentMonth = () => new Date().toISOString().slice(0, 7)

const fmtDate = (d: string | null) =>
  d ? d.slice(0, 10).replace(/-/g, '.') : '-'

const STATUS_CONFIG: Record<string, { badge: string; dot: string }> = {
  '신규':     { badge: 'bg-blue-100 text-blue-700',       dot: 'bg-blue-500' },
  '검토중':   { badge: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-500' },
  '계약완료': { badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  '보류':     { badge: 'bg-gray-100 text-gray-600',       dot: 'bg-gray-400' },
  '거절':     { badge: 'bg-red-100 text-red-700',         dot: 'bg-red-500' },
}

function getSession(): SessionUser | null {
  try {
    const cookie = document.cookie.split('; ').find(r => r.startsWith('bbk_session='))
    if (!cookie) return null
    const token = decodeURIComponent(cookie.split('=')[1])
    const [payloadB64] = token.split('.')
    return JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')))
  } catch { return null }
}

// ─── 캘린더 그리드 ─────────────────────────────────────────────

function CalendarGrid({
  year, month, applications, workers, appWorkerMap,
}: {
  year: number
  month: number
  applications: Application[]
  workers: Worker[]
  appWorkerMap: Record<string, string[]>
}) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayStr = new Date().toISOString().slice(0, 10)

  const dayMap = useMemo(() => {
    const map: Record<string, Application[]> = {}
    for (const app of applications) {
      if (!app.construction_date) continue
      const d = app.construction_date.slice(0, 10)
      ;(map[d] ??= []).push(app)
    }
    return map
  }, [applications])

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const DAYS = ['일', '월', '화', '수', '목', '금', '토']

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex-1">
      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 border-b border-gray-100">
        {DAYS.map(d => (
          <div key={d} className={`text-center py-2.5 text-xs font-semibold
            ${d === '일' ? 'text-red-500' : d === '토' ? 'text-blue-500' : 'text-gray-500'}`}>
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 셀 */}
      <div className="grid grid-cols-7 auto-rows-[6.5rem]">
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} className="border-r border-b border-gray-50 bg-gray-50/40" />

          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const apps = dayMap[dateStr] ?? []
          const isToday = dateStr === todayStr
          const dow = (firstDay + day - 1) % 7
          const isWeekend = dow === 0 || dow === 6

          return (
            <div key={day} className={`border-r border-b border-gray-50 p-1.5 flex flex-col gap-0.5
              ${isToday ? 'bg-blue-50' : isWeekend ? 'bg-gray-50/50' : ''}`}>
              {/* 날짜 숫자 */}
              <div className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full shrink-0
                ${isToday ? 'bg-blue-600 text-white' : dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-gray-700'}`}>
                {day}
              </div>
              {/* 일정 칩 */}
              <div className="flex flex-col gap-0.5 overflow-hidden">
                {apps.slice(0, 2).map(app => {
                  const cfg = STATUS_CONFIG[app.status] ?? STATUS_CONFIG['신규']
                  const workerNames = (appWorkerMap[app.id] ?? [])
                    .map(wid => workers.find(w => w.id === wid)?.name)
                    .filter(Boolean)
                    .join('·')
                  return (
                    <div key={app.id}
                      className="group px-1.5 py-0.5 rounded-md bg-indigo-100 hover:bg-indigo-200 transition-colors cursor-default"
                      title={`${app.business_name}${workerNames ? ` · ${workerNames}` : ''} · ${app.status}`}
                    >
                      <div className="flex items-center gap-1 min-w-0">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                        <span className="text-xs text-indigo-800 font-medium truncate leading-tight">
                          {app.business_name}
                        </span>
                      </div>
                      {workerNames && (
                        <p className="text-xs text-indigo-500 truncate leading-tight pl-2.5">{workerNames}</p>
                      )}
                    </div>
                  )
                })}
                {apps.length > 2 && (
                  <div className="text-xs text-gray-400 px-1.5 font-medium">+{apps.length - 2}건 더</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── 메인 페이지 ───────────────────────────────────────────────

export default function SchedulePage() {
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null)
  const [applications, setApplications] = useState<Application[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [allAssignments, setAllAssignments] = useState<WorkAssignment[]>([])
  const [loading, setLoading] = useState(true)

  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [selectedMonth, setSelectedMonth] = useState(currentMonth())
  const [personFilter, setPersonFilter] = useState('')
  const [workerFilter, setWorkerFilter] = useState('')

  useEffect(() => {
    const session = getSession()
    setCurrentUser(session)
    if (session?.role !== 'admin') setPersonFilter(session?.userId ?? '')
  }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
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
    } catch {
      toast.error('데이터 로드 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    fetch(`/api/admin/work-assignments?month=${selectedMonth}`)
      .then(r => r.json())
      .then(d => setAllAssignments(d.assignments ?? []))
      .catch(() => {})
  }, [selectedMonth])

  const isAdmin = currentUser?.role === 'admin'

  const appWorkerMap = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const a of allAssignments) {
      if (!a.application_id) continue
      ;(map[a.application_id] ??= [])
      if (!map[a.application_id].includes(a.worker_id)) map[a.application_id].push(a.worker_id)
    }
    return map
  }, [allAssignments])

  const filteredApps = useMemo(() => {
    let apps = applications.filter(a => a.construction_date?.startsWith(selectedMonth))
    if (!isAdmin && currentUser) {
      apps = apps.filter(a => a.assigned_to === currentUser.userId)
    } else if (personFilter) {
      apps = apps.filter(a => a.assigned_to === personFilter)
    }
    if (workerFilter) apps = apps.filter(a => appWorkerMap[a.id]?.includes(workerFilter))
    return [...apps].sort((a, b) =>
      (a.construction_date ?? '').localeCompare(b.construction_date ?? ''))
  }, [applications, selectedMonth, personFilter, workerFilter, isAdmin, currentUser, appWorkerMap])

  const [calYear, calMonth] = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number)
    return [y, m - 1]
  }, [selectedMonth])

  // 월 이동
  const moveMonth = (delta: number) => {
    const [y, m] = selectedMonth.split('-').map(Number)
    const next = new Date(y, m - 1 + delta, 1)
    setSelectedMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <div className="flex flex-col h-full gap-4 overflow-hidden">

      {/* ── 상단 필터 바 ────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">

        {/* 월 선택 */}
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg overflow-hidden">
          <button onClick={() => moveMonth(-1)}
            className="px-2 py-1.5 text-gray-500 hover:bg-gray-50 transition-colors text-sm font-bold">
            ‹
          </button>
          <input
            type="month"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="px-1 py-1.5 text-xs font-semibold text-gray-700 bg-transparent focus:outline-none w-28 text-center"
          />
          <button onClick={() => moveMonth(1)}
            className="px-2 py-1.5 text-gray-500 hover:bg-gray-50 transition-colors text-sm font-bold">
            ›
          </button>
        </div>

        {/* 담당자 필터 */}
        {isAdmin ? (
          <select
            value={personFilter}
            onChange={e => setPersonFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">담당자 전체</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        ) : (
          <span className="px-2 py-1.5 text-xs bg-gray-100 rounded-lg text-gray-600 border border-gray-200">
            {currentUser?.name ?? '내 일정'}
          </span>
        )}

        {/* 작업자 필터 */}
        {isAdmin && (
          <select
            value={workerFilter}
            onChange={e => setWorkerFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">작업자 전체</option>
            {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        )}

        {/* 결과 수 */}
        <span className="text-xs text-gray-400">{filteredApps.length}건</span>

        {/* 오른쪽 정렬 */}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={fetchAll}
            className="px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-600">
            새로고침
          </button>

          {/* 목록 / 캘린더 토글 */}
          <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                viewMode === 'list'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
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
                viewMode === 'calendar'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
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

      {/* ── 컨텐츠 ──────────────────────────────────────────── */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          불러오는 중...
        </div>
      ) : viewMode === 'list' ? (

        /* 목록 뷰 */
        <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-auto">
          {filteredApps.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-20">
              <span className="text-5xl">📋</span>
              <p className="text-gray-400 text-sm">해당 조건의 일정이 없습니다.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  {['시공일자', '업체명', '대표자', '담당자', '작업자', '서비스', '상태'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredApps.map(app => {
                  const cfg = STATUS_CONFIG[app.status] ?? STATUS_CONFIG['신규']
                  const workerNames = (appWorkerMap[app.id] ?? []).map(wid => workers.find(w => w.id === wid)?.name).filter(Boolean)
                  return (
                    <tr key={app.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap font-mono text-xs">{fmtDate(app.construction_date)}</td>
                      <td className="px-4 py-3 font-medium text-gray-900 max-w-[140px]">
                        <div className="flex items-center gap-1.5 truncate">
                          {app.business_name}
                          {app.drive_folder_url && <span className="text-blue-400 text-xs shrink-0">📷</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{app.owner_name}</td>
                      <td className="px-4 py-3 text-xs">
                        {users.find(u => u.id === app.assigned_to)?.name
                          ? <span className="text-gray-700">{users.find(u => u.id === app.assigned_to)!.name}</span>
                          : <span className="text-gray-300">미배정</span>}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {workerNames.length > 0
                          ? <div className="flex flex-wrap gap-1">
                              {workerNames.map(name => (
                                <span key={name} className="inline-block bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 py-0.5 rounded-md text-xs">{name}</span>
                              ))}
                            </div>
                          : <span className="text-gray-300">-</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{app.service_type ?? '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                          {app.status}
                        </span>
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
        <div className="flex-1 overflow-auto">
          <CalendarGrid
            year={calYear}
            month={calMonth}
            applications={filteredApps}
            workers={workers}
            appWorkerMap={appWorkerMap}
          />
        </div>

      )}
    </div>
  )
}
