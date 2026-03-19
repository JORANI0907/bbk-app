'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import toast from 'react-hot-toast'

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
  unit_price_per_visit: number | null
  drive_folder_url: string | null
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
const fmt = (n: number | null | undefined) => n == null ? '0' : n.toLocaleString('ko-KR')

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

export default function SchedulePage() {
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null)
  const [applications, setApplications] = useState<Application[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [allAssignments, setAllAssignments] = useState<WorkAssignment[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedMonth, setSelectedMonth] = useState(currentMonth())
  const [personFilter, setPersonFilter] = useState('')
  const [workerFilter, setWorkerFilter] = useState('')

  // 담당자 출력현황
  const [historyPersonId, setHistoryPersonId] = useState('')

  // 작업자 출력현황
  const [historyWorkerId, setHistoryWorkerId] = useState('')
  const [workerAssignments, setWorkerAssignments] = useState<WorkAssignment[]>([])
  const [workerAssLoading, setWorkerAssLoading] = useState(false)

  useEffect(() => {
    const session = getSession()
    setCurrentUser(session)
    if (session?.role !== 'admin') {
      setPersonFilter(session?.userId ?? '')
      setHistoryPersonId(session?.userId ?? '')
    }
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

  useEffect(() => {
    if (!historyWorkerId) { setWorkerAssignments([]); return }
    setWorkerAssLoading(true)
    fetch(`/api/admin/work-assignments?worker_id=${historyWorkerId}&month=${selectedMonth}`)
      .then(r => r.json())
      .then(d => setWorkerAssignments(d.assignments ?? []))
      .catch(() => { toast.error('작업자 이력 로드 실패'); setWorkerAssignments([]) })
      .finally(() => setWorkerAssLoading(false))
  }, [historyWorkerId, selectedMonth])

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

  const personHistoryApps = useMemo(() => {
    const pid = historyPersonId || (!isAdmin ? currentUser?.userId ?? '' : '')
    if (!pid) return []
    return [...applications]
      .filter(a => a.assigned_to === pid && a.construction_date?.startsWith(selectedMonth))
      .sort((a, b) => (a.construction_date ?? '').localeCompare(b.construction_date ?? ''))
  }, [applications, historyPersonId, selectedMonth, isAdmin, currentUser])

  const historyWorker = workers.find(w => w.id === historyWorkerId)
  const workerSalaryTotal = workerAssignments.reduce((s, a) => s + (a.salary ?? 0), 0)

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto pb-4">

      {/* 헤더 + 필터 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-bold text-gray-900">일정관리</h1>
          <button onClick={fetchAll} className="px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg hover:bg-gray-50">새로고침</button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* 월 필터 */}
          <input
            type="month"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {/* 담당자 필터 */}
          {isAdmin ? (
            <select
              value={personFilter}
              onChange={e => setPersonFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">작업자 전체</option>
              {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          )}
          <span className="text-xs text-gray-400 ml-auto">{filteredApps.length}건</span>
        </div>
      </div>

      {/* 일정 리스트 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-auto">
        {loading ? (
          <div className="py-16 text-center text-gray-400 text-sm">불러오는 중...</div>
        ) : filteredApps.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">해당 월의 일정이 없습니다.</div>
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
                    <td className="px-3 py-3 font-medium text-gray-900 max-w-[130px] truncate">
                      <div className="flex items-center gap-1">
                        {app.business_name}
                        {app.drive_folder_url && <span className="text-blue-400 text-xs shrink-0">📷</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-gray-700 text-xs">{app.owner_name}</td>
                    <td className="px-3 py-3 text-gray-500 text-xs">
                      {users.find(u => u.id === app.assigned_to)?.name ?? <span className="text-gray-300">미배정</span>}
                    </td>
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

      {/* 출력현황 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* 담당자 출력현황 */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-700 mb-2">담당자 출력현황</p>
            {isAdmin ? (
              <select
                value={historyPersonId}
                onChange={e => setHistoryPersonId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">담당자 선택</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            ) : (
              <span className="text-xs text-gray-600">{currentUser?.name}</span>
            )}
          </div>
          {personHistoryApps.length === 0 ? (
            <div className="p-4 text-xs text-center text-gray-400">
              {(historyPersonId || !isAdmin) ? '해당 기간 일정 없음' : '담당자를 선택하세요'}
            </div>
          ) : (
            <>
              <div className="divide-y divide-gray-50 max-h-60 overflow-y-auto">
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
              {(() => {
                const endcareApps = personHistoryApps.filter(a => a.service_type === '정기엔드케어' && a.unit_price_per_visit)
                if (!endcareApps.length) return null
                const total = endcareApps.reduce((s, a) => s + (a.unit_price_per_visit ?? 0), 0)
                return (
                  <div className="px-3 py-2 border-t border-orange-100 bg-orange-50">
                    <p className="text-xs text-orange-800">
                      정기엔드케어 <span className="font-bold">{endcareApps.length}건</span> × 단가 = <span className="font-bold">{total.toLocaleString('ko-KR')}원</span>
                    </p>
                  </div>
                )
              })()}
              <div className="px-3 py-2 border-t border-gray-100 bg-gray-50 flex justify-between">
                <p className="text-xs text-gray-500">총 <span className="font-bold text-gray-700">{personHistoryApps.length}건</span></p>
                {(() => {
                  const endcareTotal = personHistoryApps
                    .filter(a => a.service_type === '정기엔드케어' && a.unit_price_per_visit)
                    .reduce((s, a) => s + (a.unit_price_per_visit ?? 0), 0)
                  return endcareTotal > 0
                    ? <p className="text-xs font-bold text-orange-700">{endcareTotal.toLocaleString('ko-KR')}원</p>
                    : null
                })()}
              </div>
            </>
          )}
        </div>

        {/* 작업자 출력현황 / 급여 */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-700 mb-2">작업자 출력현황 / 급여</p>
            <select
              value={historyWorkerId}
              onChange={e => setHistoryWorkerId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">작업자 선택</option>
              {workers.map(w => (
                <option key={w.id} value={w.id}>{w.name} ({w.employment_type ?? '-'})</option>
              ))}
            </select>
          </div>
          {historyWorkerId ? (
            <>
              {historyWorker && (
                <div className="px-3 py-2 bg-amber-50 border-b border-amber-100">
                  {historyWorker.employment_type === '정직원' ? (
                    <p className="text-xs text-amber-800">월급 <span className="font-bold">{fmt(historyWorker.avg_salary)}원</span></p>
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
                  <div className="divide-y divide-gray-50 max-h-60 overflow-y-auto">
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
