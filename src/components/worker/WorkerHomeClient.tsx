'use client'

import { useState, useEffect } from 'react'
import { ServiceSchedule } from '@/types/database'
import { WorkerScheduleListClient } from './WorkerScheduleListClient'
import { TodayLabel } from './TodayLabel'
import { getScheduleToday } from '@/lib/schedule-today'

export function WorkerHomeClient() {
  const [schedules, setSchedules] = useState<ServiceSchedule[]>([])
  const [workerName, setWorkerName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const today = getScheduleToday()
    fetch(`/api/worker/schedules?date=${today}`, { cache: 'no-store' })
      .then(r => r.json())
      .then((data: { schedules: ServiceSchedule[]; workerName: string }) => {
        setSchedules(data.schedules ?? [])
        setWorkerName(data.workerName ?? '')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const completedCount = schedules.filter(s => s.status === 'completed').length
  const inProgressCount = schedules.filter(s => s.status === 'in_progress').length

  return (
    <div className="px-4 py-5">
      {/* Greeting header */}
      <div className="mb-5 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl p-5 text-white shadow-lg shadow-blue-200">
        <TodayLabel className="text-blue-200 text-xs font-medium mb-1 block" />
        <h1 className="text-lg font-bold leading-tight">
          {workerName ? `${workerName}님, 안녕하세요 👋` : '안녕하세요 👋'}
        </h1>

        <div className="flex items-center gap-3 mt-3">
          <div className="flex-1 bg-white/20 rounded-xl p-3 text-center">
            <p className="text-2xl font-black">{schedules.length}</p>
            <p className="text-[10px] text-blue-100 mt-0.5">오늘 현장</p>
          </div>
          <div className="flex-1 bg-white/20 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-orange-200">{inProgressCount}</p>
            <p className="text-[10px] text-blue-100 mt-0.5">진행 중</p>
          </div>
          <div className="flex-1 bg-white/20 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-green-200">{completedCount}</p>
            <p className="text-[10px] text-blue-100 mt-0.5">완료</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">불러오는 중...</div>
      ) : (
        <WorkerScheduleListClient schedules={schedules} />
      )}
    </div>
  )
}
