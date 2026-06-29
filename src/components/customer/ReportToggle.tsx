'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScheduleCard, ScheduleWithConstruction } from './ScheduleCard'
import { CompletedScheduleCard, CompletedScheduleData } from './CompletedScheduleCard'

type Tab = 'upcoming' | 'completed'

interface Props {
  upcomingSchedules: ScheduleWithConstruction[]
  completedSchedules: CompletedScheduleData[]
  driveFolderUrl?: string | null
}

export function ReportToggle({ upcomingSchedules, completedSchedules, driveFolderUrl }: Props) {
  const [tab, setTab] = useState<Tab>('upcoming')

  const tabs: { value: Tab; label: string; count: number }[] = [
    { value: 'upcoming', label: '예정', count: upcomingSchedules.length },
    { value: 'completed', label: '완료', count: completedSchedules.length },
  ]

  return (
    <section>
      {/* 헤더: 타이틀 + 전체 더보기 */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-brand-600 uppercase tracking-wide">관리 리포트</p>
        <Link
          href="/customer/schedule"
          className="flex items-center gap-0.5 text-xs text-text-tertiary hover:text-text-secondary"
        >
          전체 더보기
          <ChevronRight size={12} />
        </Link>
      </div>

      {/* 토글 + 콘텐츠 박스 */}
      <div className="rounded-2xl border border-border-subtle bg-surface shadow-soft overflow-hidden">
        {/* 세그먼트 토글 */}
        <div className="flex border-b border-border-subtle bg-surface-sunken/40">
          {tabs.map(t => {
            const active = t.value === tab
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setTab(t.value)}
                className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-surface text-brand-600 border-b-2 border-brand-600 -mb-px'
                    : 'text-text-tertiary hover:text-text-secondary'
                }`}
              >
                {t.label}
                {t.count > 0 && (
                  <span className={`ml-1 text-[11px] ${active ? 'text-brand-500' : 'text-text-tertiary'}`}>
                    {t.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* 콘텐츠 */}
        <div className="p-3">
          {tab === 'upcoming' && (
            <>
              {upcomingSchedules.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {upcomingSchedules.map(s => (
                    <Link key={s.id} href={`/customer/schedule/${s.id}`} className="block">
                      <ScheduleCard
                        schedule={s}
                        workerName={(s.worker as { name?: string } | null)?.name}
                      />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <p className="text-sm text-text-secondary font-medium">예정된 서비스가 없습니다</p>
                  <p className="text-xs text-text-tertiary mt-1">담당자에게 문의해주세요.</p>
                </div>
              )}
            </>
          )}

          {tab === 'completed' && (
            <>
              {completedSchedules.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {completedSchedules.map(s => (
                    <CompletedScheduleCard
                      key={s.id}
                      schedule={s}
                      detailHref={`/customer/schedule/${s.id}`}
                      driveFolderUrl={driveFolderUrl}
                    />
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <p className="text-sm text-text-secondary font-medium">완료된 서비스가 없습니다</p>
                  <p className="text-xs text-text-tertiary mt-1">서비스 완료 후 표시됩니다.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
