'use client'

import { useEffect, useState, useCallback } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { EventClickArg, DateSelectArg } from '@fullcalendar/core'
import { createClient } from '@/lib/supabase/client'
import { ServiceSchedule, ScheduleStatus, User } from '@/types/database'
import { SCHEDULE_STATUS_LABELS } from '@/lib/constants'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'

const CALENDAR_EVENT_COLORS: Record<ScheduleStatus, string> = {
  scheduled: '#9ca3af',
  confirmed: '#3b82f6',
  in_progress: '#f97316',
  completed: '#22c55e',
  cancelled: '#ef4444',
  rescheduled: '#eab308',
}

interface SelectedSchedule extends Omit<ServiceSchedule, 'customer' | 'worker'> {
  customer?: { business_name: string; address: string; contact_name: string; contact_phone: string } | null
  worker?: User | null
}

interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  backgroundColor: string
  borderColor: string
  extendedProps: { schedule: SelectedSchedule }
}

export default function AdminCalendarPage() {
  const supabase = createClient()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSchedule, setSelectedSchedule] = useState<SelectedSchedule | null>(null)
  const [workers, setWorkers] = useState<User[]>([])
  const [assigningWorkerId, setAssigningWorkerId] = useState<string>('')
  const [assigning, setAssigning] = useState(false)

  const fetchSchedules = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('service_schedules')
      .select(`
        *,
        customer:customers(business_name, address, contact_name, contact_phone),
        worker:users(*)
      `)
      .order('scheduled_date', { ascending: true })

    if (error) {
      console.error('일정 조회 오류:', error.message)
    } else if (data) {
      const calEvents: CalendarEvent[] = data.map((s) => {
        const schedule = s as unknown as SelectedSchedule
        const color = CALENDAR_EVENT_COLORS[schedule.status] ?? '#9ca3af'
        return {
          id: schedule.id,
          title: schedule.customer?.business_name ?? '(고객 없음)',
          start: `${schedule.scheduled_date}T${schedule.scheduled_time_start}`,
          end: `${schedule.scheduled_date}T${schedule.scheduled_time_end}`,
          backgroundColor: color,
          borderColor: color,
          extendedProps: { schedule },
        }
      })
      setEvents(calEvents)
    }
    setLoading(false)
  }, [supabase])

  const fetchWorkers = useCallback(async () => {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('role', 'worker')
      .eq('is_active', true)
      .order('name')
    if (data) setWorkers(data as User[])
  }, [supabase])

  useEffect(() => {
    fetchSchedules()
    fetchWorkers()
  }, [fetchSchedules, fetchWorkers])

  const handleEventClick = (info: EventClickArg) => {
    const schedule = info.event.extendedProps.schedule as SelectedSchedule
    setSelectedSchedule(schedule)
    setAssigningWorkerId(schedule.worker_id ?? '')
  }

  const handleAssignWorker = async () => {
    if (!selectedSchedule) return
    setAssigning(true)
    const { error } = await supabase
      .from('service_schedules')
      .update({ worker_id: assigningWorkerId || null, updated_at: new Date().toISOString() })
      .eq('id', selectedSchedule.id)

    if (!error) {
      await fetchSchedules()
      setSelectedSchedule(null)
    } else {
      alert('직원 배정 중 오류가 발생했습니다.')
    }
    setAssigning(false)
  }

  const handleDateSelect = (_selectInfo: DateSelectArg) => { // eslint-disable-line @typescript-eslint/no-unused-vars
    // 새 일정 추가 로직 (모달 확장 가능)
    alert('새 일정 추가 기능은 준비 중입니다.')
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">일정 관리</h1>
        <Button onClick={() => alert('새 일정 추가 기능은 준비 중입니다.')}>
          + 새 일정 추가
        </Button>
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap gap-3">
        {(Object.entries(CALENDAR_EVENT_COLORS) as [ScheduleStatus, string][]).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: color }} />
            <span className="text-xs text-gray-600">{SCHEDULE_STATUS_LABELS[status]}</span>
          </div>
        ))}
      </div>

      {/* 캘린더 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : (
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            locale="ko"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay',
            }}
            events={events}
            eventClick={handleEventClick}
            selectable
            select={handleDateSelect}
            height="auto"
            buttonText={{ today: '오늘', month: '월', week: '주', day: '일' }}
          />
        )}
      </div>

      {/* 일정 상세 모달 */}
      {selectedSchedule && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedSchedule(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {selectedSchedule.customer?.business_name ?? '(고객 없음)'}
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {selectedSchedule.scheduled_date} {selectedSchedule.scheduled_time_start} ~{' '}
                  {selectedSchedule.scheduled_time_end}
                </p>
              </div>
              <Badge variant={selectedSchedule.status === 'completed' ? 'success' : selectedSchedule.status === 'in_progress' ? 'warning' : 'info'}>
                {SCHEDULE_STATUS_LABELS[selectedSchedule.status]}
              </Badge>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <span className="text-gray-400 w-16 shrink-0">주소</span>
                <span className="text-gray-700">{selectedSchedule.customer?.address ?? '-'}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-400 w-16 shrink-0">담당자</span>
                <span className="text-gray-700">
                  {selectedSchedule.customer?.contact_name ?? '-'} ({selectedSchedule.customer?.contact_phone ?? '-'})
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-400 w-16 shrink-0">현재 직원</span>
                <span className="text-gray-700">{selectedSchedule.worker?.name ?? '미배정'}</span>
              </div>
            </div>

            {/* 직원 배정 */}
            <div className="pt-2 border-t border-gray-100 space-y-2">
              <label className="text-sm font-medium text-gray-700">직원 배정</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={assigningWorkerId}
                onChange={(e) => setAssigningWorkerId(e.target.value)}
              >
                <option value="">미배정</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-2 pt-1">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setSelectedSchedule(null)}
                >
                  닫기
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleAssignWorker}
                  isLoading={assigning}
                >
                  배정 저장
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
