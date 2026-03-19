'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { format, addDays, subDays } from 'date-fns'
import { ko } from 'date-fns/locale'
import { SCHEDULE_STATUS_LABELS, SCHEDULE_STATUS_COLORS, WORK_STEPS } from '@/lib/constants'

interface Worker {
  id: string
  name: string
}

interface Customer {
  id: string
  business_name: string
  address: string
  contact_name: string
  contact_phone: string
}

interface Schedule {
  id: string
  scheduled_date: string
  scheduled_time_start: string
  scheduled_time_end: string
  status: string
  work_step: number
  actual_arrival: string | null
  actual_completion: string | null
  worker_memo: string | null
  customer: Customer | null
  worker: Worker | null
}

interface GroupedWorker {
  worker: Worker | null
  schedules: Schedule[]
}

const STEP_LABELS = ['대기', '이동', '도착', 'Before 촬영', '작업 중', 'After 촬영', '완료']

function StepProgressBar({ step }: { step: number }) {
  const total = 6
  const pct = Math.round((step / total) * 100)

  const color =
    step === 0 ? 'bg-gray-300' :
    step < 3 ? 'bg-blue-500' :
    step < 5 ? 'bg-orange-500' :
    'bg-green-500'

  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 shrink-0 w-12 text-right">
        {STEP_LABELS[step] ?? '완료'}
      </span>
    </div>
  )
}

function ScheduleRow({ s }: { s: Schedule }) {
  const statusColor = SCHEDULE_STATUS_COLORS[s.status as keyof typeof SCHEDULE_STATUS_COLORS] ?? 'bg-gray-100 text-gray-600'
  const statusLabel = SCHEDULE_STATUS_LABELS[s.status as keyof typeof SCHEDULE_STATUS_LABELS] ?? s.status
  const stepInfo = s.work_step > 0 ? WORK_STEPS.find((w) => w.step === s.work_step) : null

  return (
    <Link
      href={`/worker/schedule/${s.id}`}
      className="block bg-white rounded-xl border border-gray-100 p-3 hover:border-blue-200 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {s.customer?.business_name ?? '고객 정보 없음'}
          </p>
          <p className="text-xs text-gray-500 truncate mt-0.5">{s.customer?.address ?? '-'}</p>
        </div>
        <span className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${statusColor}`}>
          {statusLabel}
        </span>
      </div>

      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span className="text-xs text-gray-500">
          🕐 {s.scheduled_time_start.slice(0, 5)} ~ {s.scheduled_time_end.slice(0, 5)}
        </span>
        {stepInfo && (
          <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
            {stepInfo.icon} Step {stepInfo.step} {stepInfo.label}
          </span>
        )}
        {s.actual_arrival && (
          <span className="text-xs text-blue-600">
            도착 {format(new Date(s.actual_arrival), 'HH:mm')}
          </span>
        )}
        {s.actual_completion && (
          <span className="text-xs text-green-600">
            완료 {format(new Date(s.actual_completion), 'HH:mm')}
          </span>
        )}
      </div>

      <StepProgressBar step={s.work_step ?? 0} />

      {s.worker_memo && (
        <p className="text-xs text-gray-400 mt-1.5 truncate">📝 {s.worker_memo}</p>
      )}
    </Link>
  )
}

function WorkerGroup({ group }: { group: GroupedWorker }) {
  const total = group.schedules.length
  const done = group.schedules.filter((s) => s.status === 'completed').length
  const inProgress = group.schedules.filter((s) => s.status === 'in_progress').length

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <span className="text-base">👷</span>
          <span className="text-sm font-bold text-gray-800">
            {group.worker?.name ?? '미배정'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          {inProgress > 0 && (
            <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
              진행 {inProgress}
            </span>
          )}
          <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
            완료 {done}/{total}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {group.schedules.map((s) => (
          <ScheduleRow key={s.id} s={s} />
        ))}
      </div>
    </div>
  )
}

export function AdminScheduleMonitor({ initialDate }: { initialDate: string }) {
  const [date, setDate] = useState(initialDate)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (d: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/schedules?date=${d}`)
      if (!res.ok) throw new Error('불러오기 실패')
      const data = await res.json()
      setSchedules(data.schedules ?? [])
    } catch {
      setSchedules([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(date)
  }, [date, load])

  const changeDate = (delta: number) => {
    const next = format(delta > 0 ? addDays(new Date(date), 1) : subDays(new Date(date), 1), 'yyyy-MM-dd')
    setDate(next)
  }

  // 직원별 그룹핑
  const groups: GroupedWorker[] = []
  const workerMap = new Map<string, GroupedWorker>()

  for (const s of schedules) {
    const key = s.worker?.id ?? '__unassigned__'
    if (!workerMap.has(key)) {
      const g: GroupedWorker = { worker: s.worker, schedules: [] }
      workerMap.set(key, g)
      groups.push(g)
    }
    workerMap.get(key)!.schedules.push(s)
  }

  const totalDone = schedules.filter((s) => s.status === 'completed').length
  const totalInProgress = schedules.filter((s) => s.status === 'in_progress').length

  return (
    <div>
      {/* 날짜 선택 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => changeDate(-1)}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600 text-lg"
        >
          ←
        </button>
        <div className="text-center">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="text-base font-bold text-gray-900 bg-transparent text-center cursor-pointer focus:outline-none"
          />
          <p className="text-xs text-gray-400 mt-0.5">
            {format(new Date(date), 'M월 d일 (EEEE)', { locale: ko })}
          </p>
        </div>
        <button
          onClick={() => changeDate(1)}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600 text-lg"
        >
          →
        </button>
      </div>

      {/* 요약 배지 */}
      {!loading && schedules.length > 0 && (
        <div className="flex gap-2 mb-4">
          <span className="text-xs bg-gray-100 text-gray-700 px-3 py-1 rounded-full">
            전체 {schedules.length}건
          </span>
          {totalInProgress > 0 && (
            <span className="text-xs bg-orange-100 text-orange-700 px-3 py-1 rounded-full font-medium">
              진행 중 {totalInProgress}
            </span>
          )}
          <span className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full">
            완료 {totalDone}
          </span>
        </div>
      )}

      {/* 목록 */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
          불러오는 중...
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <span className="text-5xl">📋</span>
          <p className="text-gray-500 text-sm">이날 배정된 일정이 없습니다.</p>
        </div>
      ) : (
        groups.map((g) => (
          <WorkerGroup key={g.worker?.id ?? '__unassigned__'} group={g} />
        ))
      )}
    </div>
  )
}
