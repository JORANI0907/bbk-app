'use client'

import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ServiceSchedule } from '@/types/database'
import { SCHEDULE_STATUS_LABELS, SCHEDULE_STATUS_COLORS } from '@/lib/constants'

export type ScheduleWithConstruction = ServiceSchedule & {
  application?: { construction_time: string | null } | null
}

const PAYMENT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  paid:     { label: '납부완료', color: 'bg-state-success-bg text-state-success' },
  invoiced: { label: '청구됨',   color: 'bg-state-info-bg text-state-info' },
  overdue:  { label: '연체',     color: 'bg-state-danger-bg text-state-danger' },
  pending:  { label: '미청구',   color: 'bg-surface-sunken text-text-secondary' },
}

function getDday(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}

function formatConstructionTimeRange(t: string): string {
  const parts = t.split(':')
  const startH = parseInt(parts[0], 10)
  const startM = parseInt(parts[1] ?? '0', 10)
  if (isNaN(startH)) return t
  const endTotalMins = startH * 60 + startM + 120
  const endH = Math.floor(endTotalMins / 60)
  const endM = endTotalMins % 60
  const startStr = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`
  const endStr   = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
  const suffix = endH > 24 ? ' (익일)' : ''
  return `${startStr} ~ ${endStr}${suffix}`
}

export function ScheduleCard({
  schedule,
  workerName,
}: {
  schedule: ScheduleWithConstruction
  workerName?: string
}) {
  const scheduledDate = new Date(schedule.scheduled_date)
  const serviceItems  = schedule.items_this_visit ?? []
  const diff          = getDday(schedule.scheduled_date)
  const showDday      = diff >= 0 && schedule.status !== 'completed' && schedule.status !== 'cancelled'
  const paymentInfo   = schedule.payment_status ? PAYMENT_STATUS_LABELS[schedule.payment_status] : null
  const constructionTime = schedule.application?.construction_time
    ? formatConstructionTimeRange(schedule.application.construction_time)
    : null

  return (
    <div
      className={`bg-surface rounded-2xl border p-4 flex flex-col gap-3 active:scale-[0.98] transition-transform ${
        showDday ? 'border-brand-100 shadow-soft' : 'border-border-subtle shadow-flat'
      }`}
    >
      {/* 날짜 + 상태 */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-text-primary">
            {format(scheduledDate, 'yyyy년 M월 d일 (EEE)', { locale: ko })}
          </p>
          {constructionTime && (
            <p className="text-xs text-text-secondary mt-0.5">
              <span className="text-text-tertiary mr-1">시공시간</span>
              {constructionTime}
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

      {/* 하단: 담당자 + 금액/납부 */}
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
