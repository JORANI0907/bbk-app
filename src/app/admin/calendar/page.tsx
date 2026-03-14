'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { EventClickArg, DateSelectArg, EventDropArg } from '@fullcalendar/core'
import toast from 'react-hot-toast'

const WORKER_COLORS = [
  '#3b82f6','#8b5cf6','#ec4899','#f97316','#14b8a6',
  '#84cc16','#f59e0b','#06b6d4','#a855f7','#ef4444',
]

const STATUS_OPTIONS = [
  { value: 'scheduled',   label: '예정' },
  { value: 'confirmed',   label: '확정' },
  { value: 'in_progress', label: '진행중' },
  { value: 'completed',   label: '완료' },
  { value: 'cancelled',   label: '취소' },
  { value: 'rescheduled', label: '일정변경' },
]

interface Worker { id: string; name: string }
interface Customer { id: string; business_name: string; address: string; contact_name: string; contact_phone: string }
interface Schedule {
  id: string
  customer_id: string
  worker_id: string | null
  scheduled_date: string
  scheduled_time_start: string
  scheduled_time_end: string
  status: string
  notes: string | null
  customer: Customer | null
  worker: Worker | null
}

interface ModalState {
  open: boolean
  mode: 'create' | 'edit'
  schedule?: Schedule
  date?: string
}

export default function AdminCalendarPage() {
  const calendarRef = useRef<InstanceType<typeof FullCalendar>>(null)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [workerFilter, setWorkerFilter] = useState<string>('all')
  const [workerColorMap, setWorkerColorMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<ModalState>({ open: false, mode: 'create' })
  const [saving, setSaving] = useState(false)

  // 폼 상태
  const [form, setForm] = useState({
    customer_id: '', worker_id: '', scheduled_date: '',
    scheduled_time_start: '09:00', scheduled_time_end: '12:00',
    status: 'scheduled', notes: '',
  })

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [schedRes, workerRes, custRes] = await Promise.all([
      fetch('/api/admin/schedules'),
      fetch('/api/admin/users?role=worker'),
      fetch('/api/admin/customers'),
    ])
    const schedData = await schedRes.json()
    const workerData = await workerRes.json()
    const custData = await custRes.json()

    const workerList: Worker[] = workerData.users ?? []
    const colorMap: Record<string, string> = {}
    workerList.forEach((w, i) => { colorMap[w.id] = WORKER_COLORS[i % WORKER_COLORS.length] })

    setSchedules(schedData.schedules ?? [])
    setWorkers(workerList)
    setCustomers(custData.customers ?? [])
    setWorkerColorMap(colorMap)
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const getEventColor = (schedule: Schedule) => {
    if (schedule.worker_id && workerColorMap[schedule.worker_id]) {
      return workerColorMap[schedule.worker_id]
    }
    return '#9ca3af' // 미배정 = 회색
  }

  const filteredSchedules = workerFilter === 'all'
    ? schedules
    : workerFilter === 'unassigned'
      ? schedules.filter(s => !s.worker_id)
      : schedules.filter(s => s.worker_id === workerFilter)

  const events = filteredSchedules.map(s => ({
    id: s.id,
    title: s.customer?.business_name ?? '(고객 없음)',
    start: `${s.scheduled_date}T${s.scheduled_time_start}`,
    end: `${s.scheduled_date}T${s.scheduled_time_end}`,
    backgroundColor: getEventColor(s),
    borderColor: getEventColor(s),
    extendedProps: { schedule: s },
  }))

  const handleEventClick = (info: EventClickArg) => {
    const s = info.event.extendedProps.schedule as Schedule
    setForm({
      customer_id: s.customer_id ?? '',
      worker_id: s.worker_id ?? '',
      scheduled_date: s.scheduled_date,
      scheduled_time_start: s.scheduled_time_start?.slice(0, 5) ?? '09:00',
      scheduled_time_end: s.scheduled_time_end?.slice(0, 5) ?? '12:00',
      status: s.status,
      notes: s.notes ?? '',
    })
    setModal({ open: true, mode: 'edit', schedule: s })
  }

  const handleDateSelect = (info: DateSelectArg) => {
    setForm(f => ({ ...f, customer_id: '', worker_id: '', scheduled_date: info.startStr.slice(0, 10), scheduled_time_start: '09:00', scheduled_time_end: '12:00', status: 'scheduled', notes: '' }))
    setModal({ open: true, mode: 'create', date: info.startStr.slice(0, 10) })
  }

  const handleEventDrop = async (info: EventDropArg) => {
    const s = info.event.extendedProps.schedule as Schedule
    const newDate = info.event.startStr.slice(0, 10)
    const res = await fetch('/api/admin/schedules', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: s.id, scheduled_date: newDate }),
    })
    if (res.ok) {
      toast.success('일정이 이동되었습니다.')
      setSchedules(prev => prev.map(sc => sc.id === s.id ? { ...sc, scheduled_date: newDate } : sc))
    } else {
      info.revert()
      toast.error('이동에 실패했습니다.')
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEventResize = async (info: any) => {
    const s = info.event.extendedProps.schedule as Schedule
    const newEnd = info.event.endStr?.slice(11, 16) ?? s.scheduled_time_end
    const res = await fetch('/api/admin/schedules', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: s.id, scheduled_time_end: newEnd }),
    })
    if (res.ok) {
      toast.success('일정이 수정되었습니다.')
    } else {
      info.revert()
      toast.error('수정에 실패했습니다.')
    }
  }

  const handleSave = async () => {
    if (!form.customer_id || !form.scheduled_date) {
      toast.error('고객과 날짜를 선택해주세요.')
      return
    }
    setSaving(true)
    try {
      const body = modal.mode === 'edit' && modal.schedule
        ? { id: modal.schedule.id, ...form }
        : { ...form }

      const res = await fetch('/api/admin/schedules', {
        method: modal.mode === 'edit' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('저장 실패')
      toast.success(modal.mode === 'edit' ? '일정이 수정되었습니다.' : '일정이 생성되었습니다.')
      setModal({ open: false, mode: 'create' })
      fetchAll()
    } catch {
      toast.error('저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!modal.schedule) return
    if (!confirm('이 일정을 삭제하시겠습니까?')) return
    setSaving(true)
    const res = await fetch('/api/admin/schedules', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: modal.schedule.id, status: 'cancelled' }),
    })
    if (res.ok) {
      toast.success('일정이 취소되었습니다.')
      setModal({ open: false, mode: 'create' })
      fetchAll()
    } else {
      toast.error('실패했습니다.')
    }
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">일정 관리</h1>
        <button
          onClick={() => {
            const today = new Date().toISOString().slice(0, 10)
            setForm(f => ({ ...f, customer_id: '', worker_id: '', scheduled_date: today, scheduled_time_start: '09:00', scheduled_time_end: '12:00', status: 'scheduled', notes: '' }))
            setModal({ open: true, mode: 'create' })
          }}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
        >
          + 새 일정
        </button>
      </div>

      {/* 직원 필터 */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setWorkerFilter('all')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${workerFilter === 'all' ? 'bg-gray-800 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
        >
          전체
        </button>
        <button
          onClick={() => setWorkerFilter('unassigned')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${workerFilter === 'unassigned' ? 'bg-gray-400 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
        >
          ⬜ 미배정
        </button>
        {workers.map(w => (
          <button
            key={w.id}
            onClick={() => setWorkerFilter(w.id)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${workerFilter === w.id ? 'text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            style={workerFilter === w.id ? { backgroundColor: workerColorMap[w.id] } : {}}
          >
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: workerColorMap[w.id] }} />
            {w.name}
          </button>
        ))}
      </div>

      {/* 직원 범례 */}
      {workers.length > 0 && (
        <div className="flex flex-wrap gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block" />미배정</span>
          {workers.map(w => (
            <span key={w.id} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: workerColorMap[w.id] }} />
              {w.name}
            </span>
          ))}
        </div>
      )}

      {/* 캘린더 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        {loading ? (
          <div className="flex justify-center py-20 text-gray-400">불러오는 중...</div>
        ) : (
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            locale="ko"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay',
            }}
            buttonText={{ today: '오늘', month: '월', week: '주', day: '일' }}
            events={events}
            editable
            selectable
            eventClick={handleEventClick}
            select={handleDateSelect}
            eventDrop={handleEventDrop}
            eventResize={handleEventResize}
            height="auto"
            eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          />
        )}
      </div>

      {/* 일정 생성/편집 모달 */}
      {modal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModal({ open: false, mode: 'create' })}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{modal.mode === 'edit' ? '일정 수정' : '새 일정 추가'}</h2>
              <button onClick={() => setModal({ open: false, mode: 'create' })} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="space-y-3">
              {/* 고객 */}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">고객 업체 *</label>
                <select
                  value={form.customer_id}
                  onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">선택하세요</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.business_name}</option>
                  ))}
                </select>
              </div>

              {/* 날짜 */}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">날짜 *</label>
                <input
                  type="date"
                  value={form.scheduled_date}
                  onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 시간 */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs font-medium text-gray-600 mb-1 block">시작 시간</label>
                  <input
                    type="time"
                    value={form.scheduled_time_start}
                    onChange={e => setForm(f => ({ ...f, scheduled_time_start: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium text-gray-600 mb-1 block">종료 시간</label>
                  <input
                    type="time"
                    value={form.scheduled_time_end}
                    onChange={e => setForm(f => ({ ...f, scheduled_time_end: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* 담당 직원 */}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">담당 직원</label>
                <select
                  value={form.worker_id}
                  onChange={e => setForm(f => ({ ...f, worker_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">미배정</option>
                  {workers.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>

              {/* 상태 */}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">상태</label>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {STATUS_OPTIONS.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* 메모 */}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">메모</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="특이사항을 입력하세요..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              {modal.mode === 'edit' && (
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-60 transition-colors"
                >
                  취소 처리
                </button>
              )}
              <button
                onClick={() => setModal({ open: false, mode: 'create' })}
                className="flex-1 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                닫기
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 text-sm bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
