'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ServiceSchedule } from '@/types/database'
import { ScheduleCard } from '@/components/worker/ScheduleCard'
import { DriveUploadButton } from '@/components/worker/DriveUploadButton'
import toast from 'react-hot-toast'

interface Props {
  schedules: ServiceSchedule[]
}

export function WorkerScheduleListClient({ schedules: initial }: Props) {
  const [schedules, setSchedules] = useState(initial)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const router = useRouter()

  const handleStart = async (scheduleId: string) => {
    setLoadingId(scheduleId)
    try {
      const res = await fetch(`/api/worker/schedule/${scheduleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_step: 1,
          status: 'in_progress',
          actual_arrival: new Date().toISOString(),
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? '업데이트 실패')
      }

      setSchedules((prev) =>
        prev.map((s) =>
          s.id === scheduleId ? { ...s, work_step: 1, status: 'in_progress' as const } : s,
        ),
      )
      toast.success('작업을 시작했습니다!')
      router.push(`/worker/schedule/${scheduleId}`)
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setLoadingId(null)
    }
  }

  const handleEnd = async (scheduleId: string) => {
    setLoadingId(scheduleId)
    try {
      const res = await fetch(`/api/worker/schedule/${scheduleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_step: 6,
          status: 'completed',
          actual_completion: new Date().toISOString(),
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? '업데이트 실패')
      }

      setSchedules((prev) =>
        prev.map((s) =>
          s.id === scheduleId ? { ...s, work_step: 6, status: 'completed' as const } : s,
        ),
      )
      toast.success('작업이 완료되었습니다!')
      router.refresh()
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setLoadingId(null)
    }
  }

  if (schedules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center bg-white rounded-2xl border border-gray-100">
        <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8 text-blue-400">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="16" y1="2" x2="16" y2="6" strokeLinecap="round" />
            <line x1="8" y1="2" x2="8" y2="6" strokeLinecap="round" />
            <line x1="3" y1="10" x2="21" y2="10" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <p className="text-base font-semibold text-gray-700">오늘 배정된 현장이 없습니다</p>
          <p className="text-sm text-gray-400 mt-1">관리자에게 문의해주세요.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {schedules.map((schedule) => {
        const isDone = schedule.status === 'completed'
        const isInProgress = schedule.status === 'in_progress'
        const isLoading = loadingId === schedule.id
        const driveUrl = schedule.customer?.drive_folder_url

        return (
          <div key={schedule.id} className="flex flex-col gap-2">
            <Link href={`/worker/schedule/${schedule.id}`}>
              <ScheduleCard schedule={schedule} onPress={() => {}} />
            </Link>

            <div className="flex gap-2 px-1">
              {/* Drive 사진 업로드 버튼 */}
              {driveUrl && (
                <DriveUploadButton
                  driveFolderUrl={driveUrl}
                  scheduledDate={schedule.scheduled_date}
                  businessName={schedule.customer?.business_name ?? '현장'}
                />
              )}

              {/* 작업 시작 */}
              {!isDone && !isInProgress && (
                <button
                  onClick={() => handleStart(schedule.id)}
                  disabled={isLoading}
                  className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl disabled:opacity-60 active:scale-[0.98] transition-transform"
                >
                  {isLoading ? '처리 중...' : '▶ 작업 시작'}
                </button>
              )}

              {/* 작업 중 — 계속하기 + 종료 */}
              {isInProgress && (
                <>
                  <Link
                    href={`/worker/schedule/${schedule.id}`}
                    className="flex-1 py-2.5 bg-orange-500 text-white text-sm font-bold rounded-xl flex items-center justify-center active:scale-[0.98] transition-transform"
                  >
                    ↩ 작업 계속
                  </Link>
                  <button
                    onClick={() => handleEnd(schedule.id)}
                    disabled={isLoading}
                    className="flex-1 py-2.5 bg-green-600 text-white text-sm font-bold rounded-xl disabled:opacity-60 active:scale-[0.98] transition-transform"
                  >
                    {isLoading ? '처리 중...' : '■ 작업 종료'}
                  </button>
                </>
              )}

              {/* 완료 */}
              {isDone && (
                <div className="flex-1 py-2.5 bg-green-50 text-green-700 text-sm font-semibold rounded-xl flex items-center justify-center border border-green-200">
                  ✅ 작업 완료
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
