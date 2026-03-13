'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useScheduleRealtime } from '@/hooks/useRealtime'
import { ServiceSchedule } from '@/types/database'
import { WORK_STEPS } from '@/lib/constants'
import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'

type MonitoringSchedule = ServiceSchedule & {
  customer: { business_name: string; address: string } | null
  worker: { name: string; phone: string } | null
}

function getElapsedTime(startTime: string | null): string {
  if (!startTime) return '-'
  const start = new Date(startTime)
  const now = new Date()
  const diffMs = now.getTime() - start.getTime()
  if (diffMs < 0) return '0분'
  const diffMin = Math.floor(diffMs / 60000)
  const hours = Math.floor(diffMin / 60)
  const minutes = diffMin % 60
  if (hours > 0) return `${hours}시간 ${minutes}분`
  return `${minutes}분`
}

export default function AdminMonitoringPage() {
  const supabase = createClient()
  const [schedules, setSchedules] = useState<MonitoringSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

  const fetchInProgressSchedules = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('service_schedules')
      .select(`
        *,
        customer:customers(business_name, address),
        worker:users(name, phone)
      `)
      .eq('scheduled_date', today)
      .eq('status', 'in_progress')
      .order('actual_arrival', { ascending: true })

    if (error) {
      console.error('모니터링 조회 오류:', error.message)
    } else if (data) {
      setSchedules(data as unknown as MonitoringSchedule[])
      setLastUpdated(new Date())
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchInProgressSchedules()
  }, [fetchInProgressSchedules])

  // 실시간 구독: 오늘 일정 업데이트 감지
  useScheduleRealtime((updated) => {
    if (updated.status === 'in_progress') {
      fetchInProgressSchedules()
    } else {
      // 완료 또는 다른 상태로 변경 시 목록에서 제거
      setSchedules((prev) => prev.filter((s) => s.id !== updated.id))
    }
  })

  const getWorkStepLabel = (step: number): string => {
    const found = WORK_STEPS.find((ws) => ws.step === step)
    return found ? `${found.icon} ${found.label}` : '대기 중'
  }

  const getWorkStepProgress = (step: number): number => {
    const maxStep = WORK_STEPS.length
    return Math.round((step / maxStep) * 100)
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">실시간 모니터링</h1>
          <p className="text-sm text-gray-500 mt-1">
            마지막 업데이트:{' '}
            {lastUpdated.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span className="text-sm text-gray-500">실시간 연결됨</span>
        </div>
      </div>

      {/* 요약 */}
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold text-gray-700">진행 중인 작업</span>
        <span className="bg-orange-100 text-orange-700 rounded-full px-2.5 py-0.5 font-bold text-xs">
          {schedules.length}건
        </span>
      </div>

      {/* 작업 카드 목록 */}
      {schedules.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-gray-400 text-sm">현재 진행 중인 작업이 없습니다.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {schedules.map((schedule) => {
            const progress = getWorkStepProgress(schedule.work_step)
            return (
              <Card key={schedule.id} className="p-5 space-y-3">
                {/* 직원 + 현장 */}
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {schedule.worker?.name ?? '(직원 없음)'}
                    </p>
                    <p className="text-sm text-gray-500 mt-0.5 truncate max-w-[200px]">
                      {schedule.customer?.business_name ?? '(고객 없음)'}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
                    경과 {getElapsedTime(schedule.actual_arrival)}
                  </span>
                </div>

                {/* 주소 */}
                <p className="text-xs text-gray-400 truncate">
                  {schedule.customer?.address ?? '-'}
                </p>

                {/* 현재 단계 */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      {getWorkStepLabel(schedule.work_step)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {schedule.work_step} / {WORK_STEPS.length} 단계
                    </span>
                  </div>
                  {/* 진행률 바 */}
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-orange-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* 단계 아이콘 */}
                <div className="flex gap-1">
                  {WORK_STEPS.map((ws) => (
                    <div
                      key={ws.step}
                      className={`flex-1 h-1 rounded-full transition-colors ${
                        ws.step <= schedule.work_step ? 'bg-orange-400' : 'bg-gray-200'
                      }`}
                      title={ws.label}
                    />
                  ))}
                </div>

                {/* 직원 연락처 */}
                {schedule.worker?.phone && (
                  <a
                    href={`tel:${schedule.worker.phone}`}
                    className="flex items-center gap-2 text-xs text-blue-600 hover:underline"
                  >
                    📞 {schedule.worker.phone}
                  </a>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
