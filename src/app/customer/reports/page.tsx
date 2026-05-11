'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Camera, ClipboardList } from 'lucide-react'
import { SectionHeader, EmptyState } from '@/components/ui'
import {
  ConditionScore,
  RecommendedService,
  RecommendationPriority,
} from '@/types/database'

interface ReportScheduleItem {
  id: string
  scheduled_date: string
  status: string
  worker_name: string | null
  condition_score: ConditionScore | null
  notes: string | null
  photo_urls: string[]
  has_before_photo: boolean
  has_after_photo: boolean
  closing_completed_at: string | null
  source: 'schedule' | 'application'
  drive_folder_url: string | null
}

interface CustomerReportsResponse {
  totalCount: number
  schedules: ReportScheduleItem[]
  latestRecommendations: RecommendedService[]
  latestReportDate: string | null
}

const CONDITION_META: Record<
  ConditionScore,
  { label: string; text: string; bg: string; border: string; dot: string }
> = {
  1: {
    label: '양호',
    text: 'text-green-700',
    bg: 'bg-green-50',
    border: 'border-green-200',
    dot: 'bg-green-500',
  },
  2: {
    label: '주의',
    text: 'text-yellow-700',
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    dot: 'bg-yellow-500',
  },
  3: {
    label: '불량',
    text: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
    dot: 'bg-red-500',
  },
}

const PRIORITY_META: Record<
  RecommendationPriority,
  { label: string; dot: string; chip: string }
> = {
  high: {
    label: '우선순위 높음',
    dot: 'bg-red-500',
    chip: 'bg-red-50 text-red-700 border-red-200',
  },
  medium: {
    label: '우선순위 보통',
    dot: 'bg-yellow-500',
    chip: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  },
  low: {
    label: '우선순위 낮음',
    dot: 'bg-gray-400',
    chip: 'bg-surface-sunken text-text-secondary border-border',
  },
}

function formatMonthKey(dateStr: string) {
  const [y, m] = dateStr.split('-')
  return `${y}년 ${parseInt(m, 10)}월`
}

function formatShortDate(dateStr: string) {
  const [, m, d] = dateStr.split('-')
  return `${m}/${d}`
}

function groupByMonth(items: ReportScheduleItem[]) {
  const map = new Map<string, ReportScheduleItem[]>()
  for (const item of items) {
    const key = item.scheduled_date.slice(0, 7)
    const arr = map.get(key) ?? []
    arr.push(item)
    map.set(key, arr)
  }
  return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1))
}

export default function CustomerReportsPage() {
  const [data, setData] = useState<CustomerReportsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [yearFilter, setYearFilter] = useState<'all' | number>('all')
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/customer/reports?months=24')
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? '리포트를 불러오지 못했습니다.')
        }
        return res.json() as Promise<CustomerReportsResponse>
      })
      .then((json) => {
        if (cancelled) return
        setData(json)
        if (json.schedules.length > 0) {
          const firstKey = json.schedules[0].scheduled_date.slice(0, 7)
          setOpenMonths({ [firstKey]: true })
        }
      })
      .catch((err: Error) => {
        if (cancelled) return
        setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const availableYears = useMemo(() => {
    if (!data) return [] as number[]
    const set = new Set<number>()
    for (const s of data.schedules) {
      set.add(parseInt(s.scheduled_date.slice(0, 4), 10))
    }
    return Array.from(set).sort((a, b) => b - a)
  }, [data])

  const filteredSchedules = useMemo(() => {
    if (!data) return [] as ReportScheduleItem[]
    if (yearFilter === 'all') return data.schedules
    return data.schedules.filter((s) =>
      s.scheduled_date.startsWith(`${yearFilter}-`),
    )
  }, [data, yearFilter])

  const grouped = useMemo(() => groupByMonth(filteredSchedules), [filteredSchedules])

  const toggleMonth = (key: string) =>
    setOpenMonths((prev) => ({ ...prev, [key]: !prev[key] }))

  if (loading) {
    return (
      <div className="px-4 py-10 flex items-center justify-center">
        <span className="text-sm text-text-tertiary">불러오는 중...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-4 py-6">
        <EmptyState
          icon={<ClipboardList size={40} />}
          title="리포트를 불러오지 못했습니다"
          description={error}
          bordered
        />
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="px-4 py-5 flex flex-col gap-5 max-w-2xl mx-auto">
      <SectionHeader
        level="page"
        title="관리 리포트"
        subtitle="방문 이력과 추천 서비스를 한눈에 확인하세요."
      />

      <div className="rounded-2xl border border-border-subtle bg-surface shadow-soft p-5 flex items-center justify-between">
        <div>
          <p className="text-xs text-text-tertiary">누적 완료</p>
          <p className="mt-1 text-3xl font-bold text-text-primary leading-tight">
            <span className="text-brand-600">{data.totalCount}</span>
            <span className="text-base font-semibold text-text-secondary ml-1">회</span>
          </p>
        </div>
        {availableYears.length > 0 && (
          <select
            value={yearFilter}
            onChange={(e) =>
              setYearFilter(
                e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10),
              )
            }
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-brand-600"
          >
            <option value="all">전체 연도</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <SectionHeader
          title="방문 이력"
          subtitle={
            filteredSchedules.length > 0
              ? `${filteredSchedules.length}회 표시`
              : '표시할 방문이 없습니다.'
          }
        />

        {grouped.length === 0 ? (
          <EmptyState
            icon={<ClipboardList size={36} />}
            title="완료된 방문이 없습니다"
            description="선택한 기간에 완료된 방문 기록이 없습니다."
            size="sm"
            bordered
          />
        ) : (
          <div className="flex flex-col gap-3">
            {grouped.map(([monthKey, items]) => {
              const isOpen = openMonths[monthKey] ?? false
              return (
                <div
                  key={monthKey}
                  className="rounded-2xl border border-border-subtle bg-surface shadow-soft overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggleMonth(monthKey)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-sunken transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <ChevronDown
                        size={16}
                        className={`text-text-tertiary transition-transform ${
                          isOpen ? '' : '-rotate-90'
                        }`}
                      />
                      <span className="text-sm font-bold text-text-primary">
                        {formatMonthKey(items[0].scheduled_date)}
                      </span>
                    </div>
                    <span className="text-xs text-text-tertiary">{items.length}회</span>
                  </button>

                  {isOpen && (
                    <ul className="divide-y divide-border-subtle border-t border-border-subtle">
                      {items.map((item) => {
                        const cond = item.condition_score
                          ? CONDITION_META[item.condition_score]
                          : null
                        const hasPhoto = item.has_before_photo || item.has_after_photo
                        return (
                          <li
                            key={item.id}
                            className="px-4 py-3 flex flex-col gap-1.5"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-12 shrink-0">
                                <p className="text-sm font-semibold text-text-primary leading-tight">
                                  {formatShortDate(item.scheduled_date)}
                                </p>
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm text-text-primary truncate">
                                  {item.worker_name ?? '담당자 미정'}
                                </p>
                                {cond ? (
                                  <span
                                    className={`inline-flex items-center gap-1 mt-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cond.bg} ${cond.border} ${cond.text}`}
                                  >
                                    <span className={`w-1.5 h-1.5 rounded-full ${cond.dot}`} />
                                    {cond.label}
                                  </span>
                                ) : (
                                  <span className="inline-block mt-1 text-[11px] text-text-tertiary">
                                    상태 미입력
                                  </span>
                                )}
                              </div>
                              {hasPhoto ? (
                                <Link
                                  href={`/customer/schedule/${item.id}`}
                                  className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
                                >
                                  <Camera size={14} />
                                  사진 보기
                                </Link>
                              ) : item.photo_urls.length > 0 ? (
                                <a
                                  href={item.photo_urls[0]}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
                                >
                                  <Camera size={14} />
                                  사진 보기
                                </a>
                              ) : item.drive_folder_url ? (
                                <a
                                  href={item.drive_folder_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
                                >
                                  <Camera size={14} />
                                  사진 보기
                                </a>
                              ) : (
                                <span className="shrink-0 text-xs text-text-tertiary">
                                  사진 없음
                                </span>
                              )}
                            </div>
                            {item.notes && (
                              <p className="ml-15 text-xs text-text-secondary leading-relaxed break-keep pl-[60px]">
                                💬 {item.notes}
                              </p>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader
          title="권장 서비스"
          subtitle={
            data.latestReportDate
              ? `${data.latestReportDate} 보고 기준`
              : '아직 보고된 추천 서비스가 없습니다.'
          }
        />

        {data.latestRecommendations.length === 0 ? (
          <EmptyState
            icon={<ClipboardList size={36} />}
            title="추천 항목이 없습니다"
            description="작업자가 현장 점검 후 권장 서비스를 입력하면 여기에 표시됩니다."
            size="sm"
            bordered
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {data.latestRecommendations.map((rec) => {
              const meta = PRIORITY_META[rec.priority]
              return (
                <li
                  key={rec.name}
                  className="rounded-2xl border border-border-subtle bg-surface shadow-soft p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                      <span className="text-sm font-bold text-text-primary truncate">
                        {rec.name}
                      </span>
                    </div>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${meta.chip}`}
                    >
                      {meta.label}
                    </span>
                  </div>
                  {rec.reason && (
                    <p className="mt-2 text-xs text-text-secondary leading-relaxed break-keep">
                      {rec.reason}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
