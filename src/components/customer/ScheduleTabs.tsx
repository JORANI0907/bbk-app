'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ServiceSchedule } from '@/types/database'
import { ScheduleCard, ScheduleWithConstruction } from './ScheduleCard'

export type { ScheduleWithConstruction }

type TabType = '예정' | '완료'

interface Props {
  upcoming: ScheduleWithConstruction[]
  past: ScheduleWithConstruction[]
}

export function ScheduleTabs({ upcoming, past }: Props) {
  const [activeTab, setActiveTab] = useState<TabType>('예정')

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: '예정', label: '예정', count: upcoming.length },
    { key: '완료', label: '완료', count: past.length },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* 탭 */}
      <div className="flex gap-2">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
              activeTab === tab.key
                ? 'bg-brand-600 text-white'
                : 'bg-surface-sunken text-text-secondary hover:text-text-primary'
            }`}
          >
            <span>{tab.label}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-none ${
              activeTab === tab.key
                ? 'bg-white/20 text-white'
                : 'bg-border text-text-tertiary'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* 예정 탭 */}
      {activeTab === '예정' && (
        <>
          {upcoming.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-center bg-surface rounded-2xl border border-border-subtle">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 text-text-tertiary">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <div>
                <p className="text-sm font-semibold text-text-primary">예정된 서비스가 없습니다</p>
                <p className="text-xs text-text-tertiary mt-1">담당자에게 문의해주세요.</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {upcoming.map((s) => (
                <Link key={s.id} href={`/customer/schedule/${s.id}`} className="block">
                  <ScheduleCard
                    schedule={s}
                    workerName={(s.worker as { name?: string } | null)?.name}
                  />
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {/* 완료 탭 */}
      {activeTab === '완료' && (
        <>
          {past.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-center bg-surface rounded-2xl border border-border-subtle">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 text-text-tertiary">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <div>
                <p className="text-sm font-semibold text-text-primary">완료된 서비스가 없습니다</p>
                <p className="text-xs text-text-tertiary mt-1">서비스 완료 후 이곳에 기록됩니다.</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {past.map((s) => (
                <Link key={s.id} href={`/customer/schedule/${s.id}`} className="block">
                  <ScheduleCard
                    schedule={s}
                    workerName={(s.worker as { name?: string } | null)?.name}
                  />
                </Link>
              ))}
              <div className="text-center py-1">
                <span className="text-xs text-text-tertiary bg-surface-sunken px-3 py-1.5 rounded-full">
                  누적 {past.filter(s => s.status === 'completed').length}회 완료
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
