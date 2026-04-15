'use client'

import { useEffect, useState, useCallback } from 'react'
import { Attendance } from '@/types/database'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import toast from 'react-hot-toast'

type Step = 'idle' | 'confirm_clock_in' | 'confirm_clock_out'

function getKSTToday() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}

function formatTime(iso: string | null | undefined) {
  if (!iso) return '-'
  return new Date(iso).toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDisplayDate(dateStr: string) {
  try {
    const [y, m, d] = dateStr.split('-').map(Number)
    return format(new Date(y, m - 1, d), 'M월 d일 (EEE)', { locale: ko })
  } catch {
    return dateStr
  }
}

export default function AttendancePage() {
  const kstToday = getKSTToday()

  const [monthRecords, setMonthRecords] = useState<Attendance[]>([])
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedDate, setSelectedDate] = useState(kstToday)
  const [step, setStep] = useState<Step>('idle')
  const [pendingRecord, setPendingRecord] = useState<Attendance | null>(null)

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/worker/attendance')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setMonthRecords(data.month ?? [])
    } catch {
      toast.error('데이터를 불러오는 데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const getLocation = (): Promise<{ lat: number; lng: number } | null> =>
    new Promise((resolve) =>
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000 },
      ),
    )

  const handleClockIn = async () => {
    setIsSubmitting(true)
    try {
      const loc = await getLocation()
      const res = await fetch('/api/worker/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ work_date: selectedDate, lat: loc?.lat, lng: loc?.lng }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? '출근 기록 실패')
      }
      toast.success(`${formatDisplayDate(selectedDate)} 출근 기록 완료`)
      setStep('idle')
      await loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '출근 기록에 실패했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClockOut = async (record: Attendance) => {
    setIsSubmitting(true)
    try {
      const loc = await getLocation()
      const res = await fetch('/api/worker/attendance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: record.id, lat: loc?.lat, lng: loc?.lng }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? '퇴근 기록 실패')
      }
      toast.success(`${formatDisplayDate(record.work_date)} 퇴근 기록 완료`)
      setStep('idle')
      setPendingRecord(null)
      await loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '퇴근 기록에 실패했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const startClockOut = (record: Attendance) => {
    setPendingRecord(record)
    setStep('confirm_clock_out')
  }

  const cancel = () => {
    setStep('idle')
    setPendingRecord(null)
  }

  const handleDateChange = (value: string) => {
    setSelectedDate(value)
    setStep('idle')
    setPendingRecord(null)
  }

  const selectedRecord = monthRecords.find((r) => r.work_date === selectedDate) ?? null

  const kstMonthLabel = new Date().toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-400 text-sm">불러오는 중...</div>
      </div>
    )
  }

  return (
    <div className="px-4 py-5 flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">출퇴근 관리</h1>
        <p className="text-sm text-gray-500 mt-1">
          {new Date().toLocaleDateString('ko-KR', {
            timeZone: 'Asia/Seoul',
            year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
          })}
        </p>
      </div>

      {/* 출근 기록 섹션 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-gray-600">출근 기록하기</h2>

        {/* 날짜 선택 */}
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">근무 날짜 선택</label>
          <input
            type="date"
            value={selectedDate}
            max={kstToday}
            onChange={(e) => handleDateChange(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1.5">
            야간 근무(22시~익일 06시)의 경우 실제 출근한 날짜를 선택해 주세요
          </p>
        </div>

        {/* 선택한 날짜의 상태에 따른 버튼 */}
        {selectedRecord ? (
          /* 이미 출근 기록 있음 */
          selectedRecord.clock_out ? (
            /* 출퇴근 모두 완료 */
            <div className="text-center py-3 bg-green-50 rounded-xl">
              <p className="text-green-700 font-semibold text-sm">
                ✅ {formatDisplayDate(selectedDate)} 출퇴근 완료
              </p>
              <p className="text-xs text-green-500 mt-1">
                출근 {formatTime(selectedRecord.clock_in)} · 퇴근 {formatTime(selectedRecord.clock_out)}
              </p>
            </div>
          ) : step === 'confirm_clock_out' && pendingRecord?.id === selectedRecord.id ? (
            /* 퇴근 확인 중 */
            <ConfirmCard
              emoji="🔴"
              label={`${formatDisplayDate(selectedDate)} 퇴근 처리하시겠습니까?`}
              sub={`출근 시각 ${formatTime(selectedRecord.clock_in)}`}
              confirmLabel="퇴근 확정"
              confirmClass="bg-gray-800 text-white"
              isSubmitting={isSubmitting}
              onConfirm={() => handleClockOut(selectedRecord)}
              onCancel={cancel}
            />
          ) : (
            /* 출근만 완료 → 퇴근 버튼 */
            <div className="flex flex-col gap-2">
              <div className="text-center py-2 bg-blue-50 rounded-xl">
                <p className="text-xs text-blue-600">
                  출근 완료 · {formatTime(selectedRecord.clock_in)}
                </p>
              </div>
              <button
                onClick={() => startClockOut(selectedRecord)}
                className="w-full py-4 bg-gray-800 text-white text-lg font-bold rounded-2xl active:scale-[0.98] transition-all"
              >
                🔴 퇴근하기
              </button>
            </div>
          )
        ) : step === 'confirm_clock_in' ? (
          /* 출근 확인 중 */
          <ConfirmCard
            emoji="🟢"
            label={`${formatDisplayDate(selectedDate)} 출근 처리하시겠습니까?`}
            confirmLabel="출근 확정"
            confirmClass="bg-blue-600 text-white"
            isSubmitting={isSubmitting}
            onConfirm={handleClockIn}
            onCancel={cancel}
          />
        ) : (
          /* 출근 버튼 */
          <button
            onClick={() => setStep('confirm_clock_in')}
            className="w-full py-4 bg-blue-600 text-white text-lg font-bold rounded-2xl active:scale-[0.98] transition-all"
          >
            🟢 출근하기
          </button>
        )}
      </div>

      {/* 이번 달 출퇴근 내역 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-600 mb-3">
          {kstMonthLabel} 출퇴근 내역
        </h2>

        {monthRecords.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            이번 달 출퇴근 내역이 없습니다.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-gray-50">
            {[...monthRecords]
              .sort((a, b) => b.work_date.localeCompare(a.work_date))
              .map((record) => (
                <RecordRow
                  key={record.id}
                  record={record}
                  isConfirming={step === 'confirm_clock_out' && pendingRecord?.id === record.id}
                  isSubmitting={isSubmitting}
                  onClockOut={() => startClockOut(record)}
                  onConfirm={() => handleClockOut(record)}
                  onCancel={cancel}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── 확인 카드 ─── */
function ConfirmCard({
  emoji, label, sub, confirmLabel, confirmClass, isSubmitting, onConfirm, onCancel,
}: {
  emoji: string
  label: string
  sub?: string
  confirmLabel: string
  confirmClass: string
  isSubmitting: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
      <div>
        <p className="text-sm font-semibold text-gray-800">{emoji} {label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          disabled={isSubmitting}
          className={`flex-1 py-2.5 text-sm font-bold rounded-xl disabled:opacity-60 ${confirmClass}`}
        >
          {isSubmitting ? '처리 중...' : confirmLabel}
        </button>
        <button
          onClick={onCancel}
          disabled={isSubmitting}
          className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl"
        >
          취소
        </button>
      </div>
    </div>
  )
}

/* ─── 내역 행 ─── */
function RecordRow({
  record, isConfirming, isSubmitting, onClockOut, onConfirm, onCancel,
}: {
  record: Attendance
  isConfirming: boolean
  isSubmitting: boolean
  onClockOut: () => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const done = !!record.clock_out

  return (
    <div className="py-3">
      <div className="flex items-center gap-3">
        {/* 날짜 */}
        <div className="w-14 shrink-0">
          <p className="text-sm font-bold text-gray-800">
            {formatDisplayDate(record.work_date).replace(/\s*\(.*\)/, '')}
          </p>
          <p className="text-xs text-gray-400">
            {formatDisplayDate(record.work_date).match(/\((.*?)\)/)?.[1]}
          </p>
        </div>

        {/* 시간 */}
        <div className="flex-1 flex gap-3 text-xs">
          <div>
            <span className="text-gray-400">출근 </span>
            <span className="font-semibold text-blue-600">{formatTime(record.clock_in)}</span>
          </div>
          <div>
            <span className="text-gray-400">퇴근 </span>
            <span className={`font-semibold ${done ? 'text-gray-700' : 'text-gray-300'}`}>
              {formatTime(record.clock_out)}
            </span>
          </div>
        </div>

        {/* 액션 */}
        {done ? (
          <span className="text-xs text-green-500 font-medium">완료</span>
        ) : isConfirming ? (
          <div className="flex gap-1">
            <button
              onClick={onConfirm}
              disabled={isSubmitting}
              className="px-3 py-1.5 bg-gray-800 text-white text-xs font-bold rounded-lg disabled:opacity-60"
            >
              {isSubmitting ? '...' : '확정'}
            </button>
            <button
              onClick={onCancel}
              disabled={isSubmitting}
              className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg"
            >
              취소
            </button>
          </div>
        ) : (
          <button
            onClick={onClockOut}
            className="px-3 py-1.5 bg-gray-800 text-white text-xs font-bold rounded-lg"
          >
            퇴근
          </button>
        )}
      </div>
    </div>
  )
}
