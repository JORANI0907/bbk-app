'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ScheduleCard, ScheduleWithConstruction } from './ScheduleCard'

export type { ScheduleWithConstruction }

type StatusFilter = '예정' | '완료'
type TypeFilter = '딥케어' | '엔드케어'

interface Props {
  upcoming: ScheduleWithConstruction[]
  past: ScheduleWithConstruction[]
}

const MONTH_LABELS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']

function classifyStatus(s: ScheduleWithConstruction, today: string): StatusFilter {
  if (
    s.scheduled_date >= today &&
    s.status !== 'completed' &&
    s.status !== 'cancelled'
  ) {
    return '예정'
  }
  return '완료'
}

export function ScheduleTabs({ upcoming, past }: Props) {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)

  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth()) // 0-indexed
  const [showYearPicker, setShowYearPicker] = useState(false)
  const [selectedStatuses, setSelectedStatuses] = useState<Set<StatusFilter>>(
    new Set<StatusFilter>(['예정'])
  )
  const [selectedTypes, setSelectedTypes] = useState<Set<TypeFilter>>(
    new Set<TypeFilter>()
  )

  const allSchedules = useMemo(
    () =>
      [...upcoming, ...past].sort((a, b) =>
        a.scheduled_date.localeCompare(b.scheduled_date)
      ),
    [upcoming, past]
  )

  function toggleStatus(s: StatusFilter) {
    setSelectedStatuses(prev => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  }

  function toggleType(t: TypeFilter) {
    setSelectedTypes(prev => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  function prevMonth() {
    if (viewMonth === 0) {
      setViewYear(y => y - 1)
      setViewMonth(11)
    } else {
      setViewMonth(m => m - 1)
    }
    setShowYearPicker(false)
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewYear(y => y + 1)
      setViewMonth(0)
    } else {
      setViewMonth(m => m + 1)
    }
    setShowYearPicker(false)
  }

  const yearOptions = Array.from({ length: 7 }, (_, i) => now.getFullYear() - 3 + i)
  const monthStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`

  const filteredSchedules = useMemo(() => {
    return allSchedules.filter(s => {
      if (!s.scheduled_date.startsWith(monthStr)) return false

      if (selectedStatuses.size > 0) {
        if (!selectedStatuses.has(classifyStatus(s, todayStr))) return false
      }

      if (selectedTypes.size > 0) {
        const ct =
          (s.customer as unknown as { customer_type?: string | null } | null)
            ?.customer_type ?? ''
        const passes =
          (selectedTypes.has('딥케어') && ct === '정기딥케어') ||
          (selectedTypes.has('엔드케어') && ct === '정기엔드케어')
        if (!passes) return false
      }

      return true
    })
  }, [allSchedules, monthStr, selectedStatuses, selectedTypes, todayStr])

  const totalCompleted = past.filter(s => s.status === 'completed').length

  return (
    <div className="flex flex-col gap-4">
      {/* 월 네비게이션 */}
      <div>
        <div className="flex items-center justify-between bg-surface rounded-2xl border border-border-subtle px-3 py-2.5">
          <button
            onClick={prevMonth}
            aria-label="이전 달"
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-sunken transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => setShowYearPicker(v => !v)}
            className="flex items-center gap-1.5 text-sm font-bold text-text-primary hover:text-brand-600 transition-colors"
          >
            <span>{viewYear}년 {MONTH_LABELS[viewMonth]}</span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`w-3.5 h-3.5 transition-transform ${showYearPicker ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <button
            onClick={nextMonth}
            aria-label="다음 달"
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-sunken transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* 연도 선택 패널 */}
        {showYearPicker && (
          <div className="mt-1 p-3 bg-surface border border-border-subtle rounded-2xl shadow-pop flex flex-wrap gap-2">
            {yearOptions.map(y => (
              <button
                key={y}
                onClick={() => {
                  setViewYear(y)
                  setShowYearPicker(false)
                }}
                className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-colors ${
                  y === viewYear
                    ? 'bg-brand-600 text-white'
                    : 'bg-surface-sunken text-text-secondary hover:text-text-primary'
                }`}
              >
                {y}년
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] text-text-tertiary font-semibold">상태</span>
        {(['예정', '완료'] as StatusFilter[]).map(s => (
          <button
            key={s}
            onClick={() => toggleStatus(s)}
            className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-colors ${
              selectedStatuses.has(s)
                ? 'bg-brand-600 text-white'
                : 'bg-surface-sunken text-text-secondary hover:text-text-primary'
            }`}
          >
            {s}
          </button>
        ))}
        <div className="w-px h-4 bg-border-subtle mx-0.5" />
        <span className="text-[10px] text-text-tertiary font-semibold">서비스</span>
        {(['딥케어', '엔드케어'] as TypeFilter[]).map(t => (
          <button
            key={t}
            onClick={() => toggleType(t)}
            className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-colors ${
              selectedTypes.has(t)
                ? t === '딥케어'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-teal-600 text-white'
                : 'bg-surface-sunken text-text-secondary hover:text-text-primary'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* 일정 목록 */}
      {filteredSchedules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3 text-center bg-surface rounded-2xl border border-border-subtle">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-10 h-10 text-text-tertiary"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-text-primary">일정이 없습니다</p>
            <p className="text-xs text-text-tertiary mt-1">
              {viewYear}년 {MONTH_LABELS[viewMonth]} 기준 조건에 맞는 일정이 없어요.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredSchedules.map(s => (
            <Link key={s.id} href={`/customer/schedule/${s.id}`} className="block">
              <ScheduleCard
                schedule={s}
                workerName={(s.worker as { name?: string } | null)?.name}
              />
            </Link>
          ))}
          {totalCompleted > 0 && (
            <div className="text-center py-1">
              <span className="text-xs text-text-tertiary bg-surface-sunken px-3 py-1.5 rounded-full">
                누적 {totalCompleted}회 완료
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
