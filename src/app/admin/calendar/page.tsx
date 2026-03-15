'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import toast from 'react-hot-toast'

interface Application {
  id: string
  business_name: string
  owner_name: string
  phone: string
  address: string
  status: string
  service_type: string | null
  assigned_to: string | null
  construction_date: string | null
  created_at: string
  supply_amount: number | null
  vat: number | null
  payment_method: string | null
}

interface User { id: string; name: string; role: string }

interface Worker {
  id: string
  name: string
  employment_type: string | null
  avg_salary: number | null
  day_wage: number | null
  night_wage: number | null
}

interface WorkAssignment {
  id: string
  worker_id: string
  application_id: string | null
  construction_date: string | null
  business_name: string | null
  salary: number | null
}

interface SessionUser { userId: string; name: string; role: string }

const currentMonth = () => new Date().toISOString().slice(0, 7)
const fmtDate = (d: string | null) => d ? d.slice(0, 10).replace(/-/g, '.') : '-'
const fmt = (n: number | null | undefined) => (n == null ? '0' : n.toLocaleString('ko-KR'))

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
  year, month, applications, users, selectedId, onSelect,
}: {
  year: number; month: number; applications: Application[]; users: User[]
  selectedId?: string; onSelect: (app: Application) => void
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
                  <button key={app.id} onClick={() => onSelect(app)}
                    className={`w-full text-left px-1 py-0.5 rounded text-xs truncate leading-tight transition-colors ${
                      selectedId === app.id ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200'
                    }`}>
                    {app.business_name}
                  </button>
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
  const [loading, setLoading] = useState(true)

  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [selectedMonth, setSelectedMonth] = useState(currentMonth())
  const [personFilter, setPersonFilter] = useState('')
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null)
  const [selected, setSelected] = useState<Application | null>(null)

  // 출력현황
  const [historyMonth, setHistoryMonth] = useState(currentMonth())
  const [historyPersonId, setHistoryPersonId] = useState('')
  const [historyWorkerId, setHistoryWorkerId] = useState('')
  const [workerAssignments, setWorkerAssignments] = useState<WorkAssignment[]>([])
  const [workerAssLoading, setWorkerAssLoading] = useState(false)

  useEffect(() => {
    const session = getSession()
    setCurrentUser(session)
    if (session && session.role !== 'admin') {
      setPersonFilter(session.userId)
      setHistoryPersonId(session.userId)
    }
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
    if (!historyWorkerId) { setWorkerAssignments([]); return }
    setWorkerAssLoading(true)
    fetch(`/api/admin/work-assignments?worker_id=${historyWorkerId}&month=${historyMonth}`)
      .then(r => r.json())
      .then(d => setWorkerAssignments(d.assignments ?? []))
      .catch(() => { toast.error('작업자 이력 로드 실패'); setWorkerAssignments([]) })
      .finally(() => setWorkerAssLoading(false))
  }, [historyWorkerId, historyMonth])

  const isAdmin = currentUser?.role === 'admin'

  const filteredApps = useMemo(() => {
    let apps = applications.filter(a => a.construction_date?.startsWith(selectedMonth))
    if (!isAdmin && currentUser) {
      apps = apps.filter(a => a.assigned_to === currentUser.userId)
    } else if (personFilter) {
      apps = apps.filter(a => a.assigned_to === personFilter)
    }
    return [...apps].sort((a, b) => (a.construction_date ?? '').localeCompare(b.construction_date ?? ''))
  }, [applications, selectedMonth, personFilter, isAdmin, currentUser])

  const personHistoryApps = useMemo(() => {
    const pid = historyPersonId || (isAdmin ? '' : currentUser?.userId ?? '')
    if (!pid) return []
    return [...applications]
      .filter(a => a.assigned_to === pid && a.construction_date?.startsWith(historyMonth))
      .sort((a, b) => (a.construction_date ?? '').localeCompare(b.construction_date ?? ''))
  }, [applications, historyPersonId, historyMonth, isAdmin, currentUser])

  const [calYear, calMonth] = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number)
    return [y, m - 1]
  }, [selectedMonth])

  const historyWorker = workers.find(w => w.id === historyWorkerId)
  const historyPerson = users.find(u => u.id === historyPersonId)
  const workerSalaryTotal = workerAssignments.reduce((s, a) => s + (a.salary ?? 0), 0)

  return (
    <div className="relative flex h-full gap-0 min-h-0">
      {/* ── 좌측: 목록/캘린더 ── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">일정 관리</h1>
          <div className="flex items-center gap-2">
            <div className="flex border border-gray-200 rounded-lg overflow-hidden">
              <button onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                목록
              </button>
              <button onClick={() => setViewMode('calendar')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'calendar' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                캘린더
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
          <span className="text-xs text-gray-400 ml-auto">{filteredApps.length}건</span>
        </div>

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
                    {['시공일자', '업체명', '대표자', '담당자', '서비스', '상태'].map(h => (
                      <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredApps.map(app => {
                    const cfg = STATUS_CONFIG[app.status] ?? STATUS_CONFIG['신규']
                    return (
                      <tr key={app.id} onClick={() => setSelected(app)}
                        className={`border-b border-gray-100 last:border-0 cursor-pointer hover:bg-blue-50 transition-colors ${selected?.id === app.id ? 'bg-blue-50' : ''}`}>
                        <td className="px-3 py-3 text-gray-500 whitespace-nowrap font-mono text-xs">{fmtDate(app.construction_date)}</td>
                        <td className="px-3 py-3 font-medium text-gray-900 max-w-[120px] truncate">{app.business_name}</td>
                        <td className="px-3 py-3 text-gray-700 text-xs">{app.owner_name}</td>
                        <td className="px-3 py-3 text-gray-500 text-xs">{users.find(u => u.id === app.assigned_to)?.name ?? <span className="text-gray-300">미배정</span>}</td>
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
            <CalendarGrid
              year={calYear} month={calMonth}
              applications={filteredApps} users={users}
              selectedId={selected?.id}
              onSelect={setSelected}
            />
          </div>
        )}
      </div>

      {/* ── 우측: 상세 + 출력현황 (오버레이) ── */}
      <div className="absolute right-0 top-0 bottom-0 w-[420px] flex flex-col gap-3 overflow-y-auto pb-4 z-20 bg-gray-50 rounded-xl border border-gray-200 shadow-2xl px-3 pt-3">

        {/* 선택된 일정 상세 */}
        {selected && (
          <div className="bg-white rounded-xl border border-gray-200 flex-shrink-0">
            <div className="p-4 border-b border-gray-100 flex items-start justify-between gap-2">
              <div>
                <h2 className="font-bold text-gray-900">{selected.business_name}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{fmtDate(selected.construction_date)} · {selected.service_type ?? '-'}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-lg shrink-0">✕</button>
            </div>
            <div className="p-4 space-y-2 text-xs">
              {[
                ['대표자', selected.owner_name],
                ['연락처', selected.phone],
                ['주소', selected.address],
                ['담당자', users.find(u => u.id === selected.assigned_to)?.name ?? '미배정'],
                ['결제방법', selected.payment_method ?? '-'],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between gap-2">
                  <span className="text-gray-400 shrink-0">{label}</span>
                  <span className="text-gray-700 text-right truncate max-w-[220px]">{val}</span>
                </div>
              ))}
              {selected.supply_amount != null && (
                <div className="flex justify-between font-semibold pt-1 border-t border-gray-100">
                  <span className="text-gray-400">총액</span>
                  <span className="text-gray-800">{fmt((selected.supply_amount ?? 0) + (selected.vat ?? 0))}원</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-1 border-t border-gray-100">
                <span className="text-gray-400">상태</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CONFIG[selected.status]?.badge ?? 'bg-gray-100 text-gray-600'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[selected.status]?.dot ?? 'bg-gray-400'} shrink-0`} />
                  {selected.status}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 담당자 출력현황 */}
        <div className="bg-white rounded-xl border border-gray-200 flex-shrink-0">
          <div className="p-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-700 mb-2">담당자 출력현황</p>
            <div className="flex gap-2">
              <input type="month" value={historyMonth} onChange={e => setHistoryMonth(e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {isAdmin ? (
                <select value={historyPersonId} onChange={e => setHistoryPersonId(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">담당자 선택</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              ) : (
                <span className="flex-1 py-1.5 text-xs text-gray-600">{historyPerson?.name ?? currentUser?.name}</span>
              )}
            </div>
          </div>
          {personHistoryApps.length === 0 ? (
            <div className="p-4 text-xs text-center text-gray-400">
              {(historyPersonId || !isAdmin) ? '해당 기간 일정 없음' : '담당자를 선택하세요'}
            </div>
          ) : (
            <>
              <div className="divide-y divide-gray-50 max-h-52 overflow-y-auto">
                {personHistoryApps.map(app => (
                  <div key={app.id} className="px-3 py-2.5 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-gray-400">{fmtDate(app.construction_date)}</p>
                      <p className="text-xs font-medium text-gray-900 truncate">{app.business_name}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_CONFIG[app.status]?.badge ?? 'bg-gray-100 text-gray-600'}`}>
                      {app.status}
                    </span>
                  </div>
                ))}
              </div>
              <div className="px-3 py-2 border-t border-gray-100 bg-gray-50">
                <p className="text-xs text-gray-500">총 <span className="font-bold text-gray-700">{personHistoryApps.length}건</span></p>
              </div>
            </>
          )}
        </div>

        {/* 작업자 출력현황 / 급여 */}
        <div className="bg-white rounded-xl border border-gray-200 flex-shrink-0">
          <div className="p-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-700 mb-2">작업자 출력현황 / 급여</p>
            <div className="flex gap-2">
              <input type="month" value={historyMonth} onChange={e => setHistoryMonth(e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <select value={historyWorkerId} onChange={e => setHistoryWorkerId(e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">작업자 선택</option>
                {workers.map(w => (
                  <option key={w.id} value={w.id}>{w.name} ({w.employment_type ?? '-'})</option>
                ))}
              </select>
            </div>
          </div>
          {historyWorkerId ? (
            <>
              {historyWorker && (
                <div className="px-3 py-2 bg-amber-50 border-b border-amber-100">
                  {historyWorker.employment_type === '정직원' ? (
                    <p className="text-xs text-amber-800">
                      월급 <span className="font-bold">{fmt(historyWorker.avg_salary)}원</span>
                    </p>
                  ) : (
                    <p className="text-xs text-amber-800">
                      주간 <span className="font-bold">{fmt(historyWorker.day_wage)}원</span>
                      <span className="mx-1.5 text-amber-300">·</span>
                      야간 <span className="font-bold">{fmt(historyWorker.night_wage)}원</span>
                      <span className="mx-1.5 text-amber-300">·</span>
                      건당 지급
                    </p>
                  )}
                </div>
              )}
              {workerAssLoading ? (
                <div className="p-4 text-xs text-center text-gray-400">불러오는 중...</div>
              ) : workerAssignments.length === 0 ? (
                <div className="p-4 text-xs text-center text-gray-400">해당 기간 출력 이력 없음</div>
              ) : (
                <>
                  <div className="divide-y divide-gray-50 max-h-52 overflow-y-auto">
                    {workerAssignments.map(ass => (
                      <div key={ass.id} className="px-3 py-2.5 flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-mono text-gray-400">{fmtDate(ass.construction_date)}</p>
                          <p className="text-xs font-medium text-gray-900 truncate">{ass.business_name ?? '-'}</p>
                        </div>
                        <span className="text-xs font-mono font-semibold text-gray-700 whitespace-nowrap">
                          {ass.salary != null ? `${fmt(ass.salary)}원` : <span className="text-gray-300">-</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="px-3 py-2 border-t border-gray-100 bg-gray-50 flex justify-between">
                    <span className="text-xs text-gray-500">{workerAssignments.length}건</span>
                    <span className="text-xs font-bold text-gray-800">{fmt(workerSalaryTotal)}원</span>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="p-4 text-xs text-center text-gray-400">작업자를 선택하세요</div>
          )}
        </div>
      </div>
    </div>
  )
}
