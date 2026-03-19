'use client'

import { useEffect, useState, useCallback } from 'react'
import { Attendance } from '@/types/database'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns'
import { ko } from 'date-fns/locale'
import toast from 'react-hot-toast'

export default function AttendancePage() {
  const [todayRecord, setTodayRecord] = useState<Attendance | null>(null)
  const [monthRecords, setMonthRecords] = useState<Attendance[]>([])
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const today = format(new Date(), 'yyyy-MM-dd')
  const currentMonth = new Date()
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd })

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/worker/attendance')
      if (!res.ok) throw new Error('데이터를 불러올 수 없습니다.')
      const data = await res.json()
      setTodayRecord(data.today)
      setMonthRecords(data.month ?? [])
    } catch (err) {
      console.error(err)
      toast.error('데이터를 불러오는 데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const getLocation = (): Promise<{ lat: number; lng: number }> =>
    new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        reject,
        { enableHighAccuracy: true, timeout: 10000 },
      ),
    )

  const handleClockIn = async () => {
    setIsSubmitting(true)
    try {
      const loc = await getLocation()
      const res = await fetch('/api/worker/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: loc.lat, lng: loc.lng }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? '출근 기록 실패')
      }
      toast.success('출근이 기록되었습니다.')
      await loadData()
    } catch (err) {
      if (err instanceof GeolocationPositionError) {
        toast.error('위치 정보를 가져올 수 없습니다.')
      } else {
        toast.error(err instanceof Error ? err.message : '출근 기록에 실패했습니다.')
      }
      console.error(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClockOut = async () => {
    if (!todayRecord) return
    setIsSubmitting(true)
    try {
      const loc = await getLocation()
      const res = await fetch('/api/worker/attendance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: todayRecord.id, lat: loc.lat, lng: loc.lng }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? '퇴근 기록 실패')
      }
      toast.success('퇴근이 기록되었습니다.')
      await loadData()
    } catch (err) {
      if (err instanceof GeolocationPositionError) {
        toast.error('위치 정보를 가져올 수 없습니다.')
      } else {
        toast.error(err instanceof Error ? err.message : '퇴근 기록에 실패했습니다.')
      }
      console.error(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const hasWorked = (dateStr: string) =>
    monthRecords.some((r) => r.work_date === dateStr && r.clock_in)

  const formatKoreanTime = (isoString: string | null | undefined) => {
    if (!isoString) return '-'
    return format(new Date(isoString), 'HH:mm')
  }

  const firstDayOfWeek = getDay(monthStart)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-400 text-sm">불러오는 중...</div>
      </div>
    )
  }

  return (
    <div className="px-4 py-5 flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">출퇴근 관리</h1>
        <p className="text-sm text-gray-500 mt-1">{format(new Date(), 'yyyy년 M월 d일 (EEE)', { locale: ko })}</p>
      </div>

      {/* 오늘 현황 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-600 mb-4">오늘 출퇴근 현황</h2>
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-1">출근</p>
            <p className="text-2xl font-bold text-blue-600">
              {formatKoreanTime(todayRecord?.clock_in)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-1">퇴근</p>
            <p className="text-2xl font-bold text-gray-700">
              {formatKoreanTime(todayRecord?.clock_out)}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {!todayRecord?.clock_in ? (
            <button
              onClick={handleClockIn}
              disabled={isSubmitting}
              className="w-full py-4 bg-blue-600 text-white text-lg font-bold rounded-2xl active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {isSubmitting ? '처리 중...' : '🟢 출근하기'}
            </button>
          ) : !todayRecord?.clock_out ? (
            <button
              onClick={handleClockOut}
              disabled={isSubmitting}
              className="w-full py-4 bg-gray-800 text-white text-lg font-bold rounded-2xl active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {isSubmitting ? '처리 중...' : '🔴 퇴근하기'}
            </button>
          ) : (
            <div className="text-center py-3 bg-green-50 rounded-2xl">
              <p className="text-green-700 font-semibold">오늘 출퇴근 완료 ✅</p>
            </div>
          )}
        </div>
      </div>

      {/* 이번 달 달력 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-600 mb-4">
          {format(currentMonth, 'yyyy년 M월', { locale: ko })} 출근 현황
        </h2>

        <div className="grid grid-cols-7 gap-1 mb-2">
          {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
            <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}

          {daysInMonth.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd')
            const isToday = dateStr === today
            const worked = hasWorked(dateStr)
            const isPast = day < new Date() && !isToday

            return (
              <div
                key={dateStr}
                className={`aspect-square flex items-center justify-center rounded-full text-xs font-medium
                  ${isToday ? 'bg-blue-600 text-white' : ''}
                  ${worked && !isToday ? 'bg-green-100 text-green-700' : ''}
                  ${!worked && isPast && !isToday ? 'text-gray-300' : ''}
                  ${!worked && !isPast && !isToday ? 'text-gray-500' : ''}
                `}
              >
                {format(day, 'd')}
              </div>
            )
          })}
        </div>

        <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-green-100" />
            출근
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-blue-600" />
            오늘
          </div>
        </div>
      </div>
    </div>
  )
}
