'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ServiceSchedule } from '@/types/database'
import { SCHEDULE_STATUS_LABELS, SCHEDULE_STATUS_COLORS } from '@/lib/constants'

type TabType = '예정' | '완료'

interface Props {
  upcoming: ServiceSchedule[]
  past: ServiceSchedule[]
}

const PAYMENT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  paid: { label: '납부완료', color: 'bg-state-success-bg text-state-success' },
  invoiced: { label: '청구됨', color: 'bg-state-info-bg text-state-info' },
  overdue: { label: '연체', color: 'bg-state-danger-bg text-state-danger' },
  pending: { label: '미청구', color: 'bg-surface-sunken text-text-secondary' },
}

function getDday(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}

function ScheduleCard({ schedule, workerName }: { schedule: ServiceSchedule; workerName?: string }) {
  const scheduledDate = new Date(schedule.scheduled_date)
  const serviceItems = schedule.items_this_visit ?? []
  const diff = getDday(schedule.scheduled_date)
  const showDday = diff >= 0 && schedule.status !== 'completed' && schedule.status !== 'cancelled'
  const paymentInfo = schedule.payment_status ? PAYMENT_STATUS_LABELS[schedule.payment_status] : null

  return (
    <div
      className={`bg-surface rounded-2xl border p-4 flex flex-col gap-3 active:scale-[0.98] transition-transform ${
        showDday
          ? 'border-brand-100 shadow-soft'
          : 'border-border-subtle shadow-flat'
      }`}
    >
      {/* 날짜 + 상태 */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-text-primary">
            {format(scheduledDate, 'yyyy년 M월 d일 (EEE)', { locale: ko })}
          </p>
          {(schedule.scheduled_time_start || schedule.scheduled_time_end) && (
            <p className="text-xs text-text-secondary mt-0.5">
              {schedule.scheduled_time_start?.slice(0, 5)}
              {schedule.scheduled_time_end ? ` ~ ${schedule.scheduled_time_end.slice(0, 5)}` : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold whitespace-nowrap ${
            SCHEDULE_STATUS_COLORS[schedule.status] ?? 'bg-surface-sunken text-text-secondary'
          }`}>
            {SCHEDULE_STATUS_LABELS[schedule.status] ?? schedule.status}
          </span>
          <span className="text-text-tertiary">›</span>
        </div>
      </div>

      {/* 서비스 항목 */}
      {serviceItems.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {serviceItems.map((item, i) => (
            <span key={item.id || i} className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-medium">
              {item.name}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-text-tertiary">서비스 항목 미지정</p>
      )}

      {/* 하단 정보 행 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {workerName && (
            <p className="text-xs text-text-secondary flex items-center gap-1 min-w-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 shrink-0">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <span className="truncate">{workerName}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {schedule.payment_amount != null && (
            <span className="text-xs font-semibold text-text-secondary">
              {Number(schedule.payment_amount).toLocaleString()}원
            </span>
          )}
          {paymentInfo && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${paymentInfo.color}`}>
              {paymentInfo.label}
            </span>
          )}
        </div>
      </div>

      {showDday && (
        <p className={`text-xs font-bold border-t border-border-subtle pt-2 -mt-1 ${diff === 0 ? 'text-state-danger' : 'text-brand-600'}`}>
          {diff === 0 ? '오늘 서비스 예정!' : `D-${diff}`}
        </p>
      )}
    </div>
  )
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
