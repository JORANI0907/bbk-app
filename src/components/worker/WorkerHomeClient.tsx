'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Wrench } from 'lucide-react'
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
      {/* Toss 스타일 인사말 (그라디언트 배너 제거) */}
      <div className="mb-5">
        <TodayLabel className="text-text-tertiary text-xs font-medium mb-1 block" />
        <h1 className="text-2xl font-bold leading-tight text-text-primary break-keep">
          {workerName ? `${workerName}님, 안녕하세요` : '안녕하세요'}
        </h1>

        {/* 3-metric summary — 화이트 카드 + subtle brand accent */}
        <div className="flex items-center gap-2 mt-4">
          <div className="flex-1 bg-surface border border-border-subtle shadow-soft rounded-2xl p-3 text-center">
            <p className="text-2xl font-bold text-text-primary tabular-nums">{schedules.length}</p>
            <p className="text-xs text-text-secondary mt-0.5 font-medium">오늘 현장</p>
          </div>
          <div className="flex-1 bg-surface border border-border-subtle shadow-soft rounded-2xl p-3 text-center">
            <p className="text-2xl font-bold text-brand-600 tabular-nums">{inProgressCount}</p>
            <p className="text-xs text-text-secondary mt-0.5 font-medium">진행 중</p>
          </div>
          <div className="flex-1 bg-surface border border-border-subtle shadow-soft rounded-2xl p-3 text-center">
            <p className="text-2xl font-bold text-state-success tabular-nums">{completedCount}</p>
            <p className="text-xs text-text-secondary mt-0.5 font-medium">완료</p>
          </div>
        </div>
      </div>

      {/* 정기관리 링크 카드 (매주 사진 제출) */}
      <Link
        href="/worker/regular-care"
        className="flex items-center gap-3 bg-surface border border-border-subtle shadow-soft rounded-2xl p-3 mb-4 hover:bg-surface-sunken transition-colors"
      >
        <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center shrink-0">
          <Wrench size={20} className="text-brand-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary">🧰 정기관리 (주간 장비 정리)</p>
          <p className="text-xs text-text-secondary mt-0.5">이번 주 자기 장비·도구 정리 사진 제출</p>
        </div>
        <span className="text-text-tertiary text-sm">→</span>
      </Link>

      {loading ? (
        <div className="py-12 text-center text-sm text-text-tertiary">불러오는 중...</div>
      ) : (
        <WorkerScheduleListClient schedules={schedules} />
      )}
    </div>
  )
}
