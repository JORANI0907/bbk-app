'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'

interface Application {
  id: string
  business_name: string
  owner_name: string
  phone: string
  email: string | null
  address: string
  status: string
  service_type: string | null
  assigned_to: string | null
  construction_date: string | null
  created_at: string
  supply_amount: number | null
  vat: number | null
  unit_price_per_visit: number | null
  payment_method: string | null
  drive_folder_url: string | null
}

interface User { id: string; name: string; role: string }
interface Worker { id: string; name: string; employment_type: string | null }
interface WorkAssignment { id: string; worker_id: string; application_id: string | null }
interface SessionUser { userId: string; name: string; role: string }

const currentMonth = () => new Date().toISOString().slice(0, 7)
const fmtDate = (d: string | null) => d ? d.slice(0, 10).replace(/-/g, '.') : '-'

const STATUS_CONFIG: Record<string, { badge: string; dot: string }> = {
  '신규':    { badge: 'bg-blue-100 text-blue-700',       dot: 'bg-blue-500' },
  '검토중':  { badge: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-500' },
  '계약완료': { badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  '보류':    { badge: 'bg-gray-100 text-gray-600',       dot: 'bg-gray-400' },
  '거절':    { badge: 'bg-red-100 text-red-700',         dot: 'bg-red-500' },
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

function CalendarGrid({
  year, month, applications, users,
}: {
  year: number; month: number; applications: Application[]; users: User[]
}) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayStr = new Date().toISOString().slice(0, 10)

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
          <div key={d} className={`text-center py-2 text-xs font-semibold ${d === '일' ? 'text-red-500' : d === '토' ? 'text-blue-500' : 'text-gray-500'}`}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} className="h-[5.5rem] border-r border-b border-gray-50" />
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const apps = dayMap[dateStr] ?? []
          const isToday = dateStr === todayStr
          const dow = (firstDay + day - 1) % 7
          return (
            <div key={day} className={`h-[5.5rem] border-r border-b border-gray-50 p-1 ${isToday ? 'bg-blue-50' : ''}`}>
              <div className={`text-xs font-semibold mb-0.5 w-5 h-5 flex items-center justify-center rounded-full ${
                isToday ? 'bg-blue-600 text-white' : dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-gray-700'
              }`}>{day}</div>
              <div className="space-y-0.5 overflow-hidden">
                {apps.slice(0, 2).map(app => (
                  <div key={app.id} className="w-full text-left px-1 py-0.5 rounded text-xs truncate leading-tight bg-indigo-100 text-indigo-800">
                    {app.business_name}
                  </div>
                ))}
                {apps.length > 2 && <div className="text-xs text-gray-400 px-1">+{apps.length - 2}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function AdminCalendarPage() {
  const [applications, setApplications] = useState<Application[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [allAssignments, setAllAssignments] = useState<WorkAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null)

  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('calendar')
  const [selectedMonth, setSelectedMonth] = useState(currentMonth())
  const [personFilter, setPersonFilter] = useState('')
  const [workerFilter, setWorkerFilter] = useState('')

  useEffect(() => {
    const session = getSession()
    setCurrentUser(session)
    if (session && session.role !== 'admin') setPersonFilter(session.userId)
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
      if (!map[a.application_id]) map[a.application_id] = []
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
    return [...apps].sort((a, b) => (a.construction_date ?? '').localeCompare(b.construction_date ?? ''))
  }, [applications, selectedMonth, personFilter, workerFilter, isAdmin, currentUser, appWorkerMap])

  const [calYear, calMonth] = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number)
    return [y, m - 1]
  }, [selectedMonth])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">배정캘린더</h1>
        <div className="flex items-center gap-2">
          <div className="flex border border-gray-200 rounded-lg overflow-hidden">
            <button onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'calendar' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              캘린더
            </button>
            <button onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              목록
            </button>
          </div>
          <button onClick={fetchAll} className="px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg hover:bg-gray-50">새로고침</button>
        </div>
      </div>

      {/* 필터 */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
        {isAdmin ? (
          <select value={personFilter} onChange={e => setPersonFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">담당자 전체</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        ) : (
          <span className="px-2 py-1.5 text-xs bg-gray-100 rounded-lg text-gray-600 border border-gray-200">
            {currentUser?.name ?? '내 일정'}
          </span>
        )}
        {isAdmin && (
          <select value={workerFilter} onChange={e => setWorkerFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">작업자 전체</option>
            {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        )}
        <span className="text-xs text-gray-400 ml-auto">{filteredApps.length}건</span>
      </div>

      {/* 컨텐츠 */}
      {loading ? (
        <div className="py-20 text-center text-gray-400 text-sm">불러오는 중...</div>
      ) : viewMode === 'list' ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-auto flex-1">
          {filteredApps.length === 0 ? (
            <div className="py-20 text-center text-gray-400 text-sm">일정이 없습니다.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  {['시공일자', '업체명', '대표자', '담당자', '작업자', '서비스', '상태'].map(h => (
                    <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredApps.map(app => {
                  const cfg = STATUS_CONFIG[app.status] ?? STATUS_CONFIG['신규']
                  return (
                    <tr key={app.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-3 text-gray-500 whitespace-nowrap font-mono text-xs">{fmtDate(app.construction_date)}</td>
                      <td className="px-3 py-3 font-medium text-gray-900 max-w-[120px] truncate">
                        <div className="flex items-center gap-1">
                          {app.business_name}
                          {app.drive_folder_url && <span className="text-blue-400 text-xs shrink-0">📷</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-gray-700 text-xs">{app.owner_name}</td>
                      <td className="px-3 py-3 text-gray-500 text-xs">{users.find(u => u.id === app.assigned_to)?.name ?? <span className="text-gray-300">미배정</span>}</td>
                      <td className="px-3 py-3 text-gray-500 text-xs">
                        {(appWorkerMap[app.id] ?? []).map(wid => {
                          const w = workers.find(x => x.id === wid)
                          return w ? <span key={wid} className="inline-block bg-gray-100 text-gray-600 px-1.5 rounded text-xs mr-1">{w.name}</span> : null
                        })}
                        {!(appWorkerMap[app.id]?.length) && <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-3 py-3 text-gray-500 text-xs">{app.service_type ?? '-'}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} shrink-0`} />
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
        <div className="overflow-auto flex-1">
          <CalendarGrid year={calYear} month={calMonth} applications={filteredApps} users={users} />
        </div>
      )}
    </div>
  )
}
