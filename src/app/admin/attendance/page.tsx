'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'

interface AttendanceRecord {
  id: string
  worker_id: string
  worker_name: string
  work_date: string
  clock_in: string | null
  clock_out: string | null
  clock_in_lat: number | null
  clock_in_lng: number | null
  clock_out_lat: number | null
  clock_out_lng: number | null
  status: string | null
  notes: string | null
  worker?: { id: string; name: string; employment_type: string } | null
}

interface Worker {
  id: string
  name: string
  employment_type: string
}

function formatTime(ts: string | null): string {
  if (!ts) return '-'
  return new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

function formatDuration(clockIn: string | null, clockOut: string | null): string {
  if (!clockIn || !clockOut) return '-'
  const diff = new Date(clockOut).getTime() - new Date(clockIn).getTime()
  if (diff <= 0) return '-'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return `${h}h ${m}m`
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function getWeekday(dateStr: string): number {
  return new Date(dateStr).getDay()
}

export default function AttendancePage() {
  const today = new Date()
  const [yearMonth, setYearMonth] = useState(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  )
  const [workers, setWorkers] = useState<Worker[]>([])
  const [selectedWorkerId, setSelectedWorkerId] = useState('')
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [userRole, setUserRole] = useState<string>('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{ clock_in: string; clock_out: string; notes: string }>({
    clock_in: '', clock_out: '', notes: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/admin/workers')
      .then(r => r.json())
      .then(j => setWorkers(j.workers ?? []))
      .catch(() => {})

    fetch('/api/admin/me')
      .then(r => r.json())
      .then(j => setUserRole(j.role ?? ''))
      .catch(() => {})
  }, [])

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ month: yearMonth })
      if (selectedWorkerId) params.set('worker_id', selectedWorkerId)
      const res = await fetch(`/api/admin/attendance?${params}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || '로드 실패'); return }
      setRecords(json.data ?? [])
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setLoading(false)
    }
  }, [yearMonth, selectedWorkerId])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  const handleEditStart = (rec: AttendanceRecord) => {
    setEditingId(rec.id)
    setEditForm({
      clock_in: rec.clock_in ? new Date(rec.clock_in).toISOString().slice(0, 16) : '',
      clock_out: rec.clock_out ? new Date(rec.clock_out).toISOString().slice(0, 16) : '',
      notes: rec.notes ?? '',
    })
  }

  const handleEditSave = async () => {
    if (!editingId) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = { id: editingId, notes: editForm.notes }
      if (editForm.clock_in) body.clock_in = new Date(editForm.clock_in).toISOString()
      if (editForm.clock_out) body.clock_out = new Date(editForm.clock_out).toISOString()

      const res = await fetch('/api/admin/attendance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || '수정 실패'); return }
      toast.success('수정되었습니다.')
      setEditingId(null)
      fetchRecords()
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setSaving(false)
    }
  }

  const [year, month] = yearMonth.split('-').map(Number)
  const daysInMonth = getDaysInMonth(year, month)

  const recordsByDate = records.reduce<Record<string, AttendanceRecord[]>>((acc, rec) => {
    const d = rec.work_date
    return { ...acc, [d]: [...(acc[d] ?? []), rec] }
  }, {})

  const months: string[] = []
  for (let i = -5; i <= 2; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">출퇴근 관리</h1>
        <p className="text-sm text-gray-500 mt-1">직원별 출퇴근 기록을 조회하고 관리합니다.</p>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select
          value={yearMonth}
          onChange={e => setYearMonth(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {months.map(m => (
            <option key={m} value={m}>{m.replace('-', '년 ')}월</option>
          ))}
        </select>

        {userRole === 'admin' && (
          <select
            value={selectedWorkerId}
            onChange={e => setSelectedWorkerId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">전체 직원</option>
            {workers.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">불러오는 중...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-20">날짜</th>
                  {userRole === 'admin' && !selectedWorkerId && (
                    <th className="text-left px-4 py-3 font-medium text-gray-600 w-24">이름</th>
                  )}
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-24">출근</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-24">퇴근</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-20">근무시간</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">메모</th>
                  {userRole === 'admin' && (
                    <th className="text-left px-4 py-3 font-medium text-gray-600 w-16">수정</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = String(i + 1).padStart(2, '0')
                  const dateStr = `${yearMonth}-${day}`
                  const dayRecs = recordsByDate[dateStr] ?? []
                  const weekday = getWeekday(dateStr)
                  const isWeekend = weekday === 0 || weekday === 6
                  const dayLabel = ['일', '월', '화', '수', '목', '금', '토'][weekday]

                  if (dayRecs.length === 0) {
                    return (
                      <tr key={dateStr} className={`border-b border-gray-50 ${isWeekend ? 'bg-red-50/30' : ''}`}>
                        <td className={`px-4 py-2.5 font-medium ${weekday === 0 ? 'text-red-500' : weekday === 6 ? 'text-blue-500' : 'text-gray-700'}`}>
                          {i + 1}일 ({dayLabel})
                        </td>
                        {userRole === 'admin' && !selectedWorkerId && <td className="px-4 py-2.5 text-gray-300">-</td>}
                        <td className="px-4 py-2.5 text-gray-300">-</td>
                        <td className="px-4 py-2.5 text-gray-300">-</td>
                        <td className="px-4 py-2.5 text-gray-300">-</td>
                        <td className="px-4 py-2.5 text-gray-300">-</td>
                        {userRole === 'admin' && <td className="px-4 py-2.5" />}
                      </tr>
                    )
                  }

                  return dayRecs.map((rec, idx) => (
                    <tr key={rec.id} className={`border-b border-gray-50 ${isWeekend ? 'bg-red-50/30' : 'hover:bg-gray-50/50'}`}>
                      {idx === 0 && (
                        <td className={`px-4 py-2.5 font-medium align-top ${weekday === 0 ? 'text-red-500' : weekday === 6 ? 'text-blue-500' : 'text-gray-700'}`} rowSpan={dayRecs.length}>
                          {i + 1}일 ({dayLabel})
                        </td>
                      )}
                      {userRole === 'admin' && !selectedWorkerId && (
                        <td className="px-4 py-2.5 text-gray-700 font-medium">
                          {rec.worker?.name ?? rec.worker_name ?? '-'}
                        </td>
                      )}

                      {editingId === rec.id ? (
                        <>
                          <td className="px-4 py-2">
                            <input type="datetime-local" value={editForm.clock_in}
                              onChange={e => setEditForm(f => ({ ...f, clock_in: e.target.value }))}
                              className="border rounded px-2 py-1 text-xs w-36" />
                          </td>
                          <td className="px-4 py-2">
                            <input type="datetime-local" value={editForm.clock_out}
                              onChange={e => setEditForm(f => ({ ...f, clock_out: e.target.value }))}
                              className="border rounded px-2 py-1 text-xs w-36" />
                          </td>
                          <td className="px-4 py-2 text-gray-400 text-xs">-</td>
                          <td className="px-4 py-2">
                            <input value={editForm.notes}
                              onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                              className="border rounded px-2 py-1 text-xs w-full" placeholder="메모" />
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex gap-1">
                              <button onClick={handleEditSave} disabled={saving}
                                className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">
                                저장
                              </button>
                              <button onClick={() => setEditingId(null)}
                                className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded hover:bg-gray-200">
                                취소
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-2.5 text-gray-700">{formatTime(rec.clock_in)}</td>
                          <td className="px-4 py-2.5 text-gray-700">{formatTime(rec.clock_out)}</td>
                          <td className="px-4 py-2.5 text-gray-500">{formatDuration(rec.clock_in, rec.clock_out)}</td>
                          <td className="px-4 py-2.5 text-gray-500 max-w-xs truncate">{rec.notes || '-'}</td>
                          {userRole === 'admin' && (
                            <td className="px-4 py-2.5">
                              <button onClick={() => handleEditStart(rec)}
                                className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                                수정
                              </button>
                            </td>
                          )}
                        </>
                      )}
                    </tr>
                  ))
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
