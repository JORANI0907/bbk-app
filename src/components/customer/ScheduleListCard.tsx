'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { FolderOpen } from 'lucide-react'
import { ServiceSchedule } from '@/types/database'
import { SCHEDULE_STATUS_LABELS, SCHEDULE_STATUS_COLORS } from '@/lib/constants'

export type ScheduleListItem = ServiceSchedule & {
  worker?: { name?: string } | null
  application?: { construction_time?: string | null } | null
  closing_checklists?: Array<{
    condition_score: number | null
    recommended_services: unknown
    customer_comment: string | null
  }> | null
}

type RatingMeta = { label: string; tone: string; dot: string }

const CONDITION_META: Record<number, RatingMeta> = {
  1: { label: '양호', tone: 'text-green-700', dot: 'bg-green-500' },
  2: { label: '주의', tone: 'text-yellow-700', dot: 'bg-yellow-500' },
  3: { label: '불량', tone: 'text-red-700', dot: 'bg-red-500' },
}

const PRIORITY_CHIP: Record<string, { label: string; chip: string }> = {
  high: { label: '불량', chip: 'bg-red-50 text-red-700 border-red-200' },
  medium: { label: '주의', chip: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  low: { label: '관심', chip: 'bg-surface-sunken text-text-secondary border-border' },
}

function deriveOuterMeta(recs: Array<{ priority: string }>): RatingMeta {
  if (recs.length === 0) return CONDITION_META[1]
  const priorities = new Set(recs.map(r => r.priority))
  if (priorities.has('high')) return CONDITION_META[3]
  if (priorities.has('medium')) return CONDITION_META[2]
  return CONDITION_META[1]
}

function getDday(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}

function InlineMetric({ label, meta }: { label: string; meta: RatingMeta }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-text-tertiary">{label}</span>
      <span className={`inline-flex items-center gap-0.5 font-semibold ${meta.tone}`}>
        <span className={`w-1 h-1 rounded-full ${meta.dot}`} />
        {meta.label}
      </span>
    </span>
  )
}

interface Props {
  schedule: ScheduleListItem
  detailHref: string
  driveFolderUrl?: string | null
}

export function ScheduleListCard({ schedule, detailHref, driveFolderUrl }: Props) {
  const scheduledDate = new Date(schedule.scheduled_date)
  const status = schedule.status
  const isCompleted = status === 'completed'
  const isUpcoming = status === 'scheduled' || status === 'confirmed'

  const closing = schedule.closing_checklists?.[0] ?? null
  const conditionScore = closing?.condition_score ?? null
  const recs = Array.isArray(closing?.recommended_services)
    ? (closing!.recommended_services as Array<{ name: string; reason?: string; priority: string }>)
    : []
  const comment = closing?.customer_comment ?? null
  const workerName = schedule.worker?.name ?? null
  const items = schedule.items_this_visit ?? []

  const comfortMeta = isCompleted && conditionScore != null ? CONDITION_META[conditionScore] : null
  const outerMeta = isCompleted ? deriveOuterMeta(recs) : null

  const dday = isUpcoming ? getDday(schedule.scheduled_date) : null
  const statusLabel = SCHEDULE_STATUS_LABELS[status] ?? status
  const statusColor = SCHEDULE_STATUS_COLORS[status] ?? 'bg-surface-sunken text-text-secondary'

  return (
    <div className="bg-surface rounded-2xl border border-border-subtle shadow-flat overflow-hidden">
      <Link href={detailHref} className="block p-3 flex flex-col gap-2 active:scale-[0.98] transition-transform">
        {/* Compact header: date + worker + status */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2 min-w-0">
            <p className="text-sm font-bold text-text-primary whitespace-nowrap">
              {format(scheduledDate, 'M월 d일 (EEE)', { locale: ko })}
            </p>
            {workerName && (
              <p className="text-[11px] text-text-tertiary truncate">담당 {workerName}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {dday !== null && dday >= 0 && (
              <span className={`text-[11px] font-bold ${dday === 0 ? 'text-state-danger' : 'text-brand-600'}`}>
                {dday === 0 ? '오늘' : `D-${dday}`}
              </span>
            )}
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${statusColor}`}>
              {statusLabel}
            </span>
          </div>
        </div>

        {/* Service items (compact chips) */}
        {items.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {items.slice(0, 4).map((item, i) => (
              <span key={item.id || i} className="text-[10px] bg-brand-50 text-brand-700 px-1.5 py-0.5 rounded-full font-medium">
                {item.name}
              </span>
            ))}
            {items.length > 4 && (
              <span className="text-[10px] text-text-tertiary self-center">+{items.length - 4}</span>
            )}
          </div>
        )}

        {/* Completed: inline metrics row */}
        {isCompleted && (comfortMeta || outerMeta) && (
          <div className="flex items-center gap-2 text-[11px] flex-wrap pt-0.5">
            {comfortMeta && <InlineMetric label="쾌적" meta={comfortMeta} />}
            {comfortMeta && outerMeta && <span className="text-border">·</span>}
            {outerMeta && <InlineMetric label="범위외" meta={outerMeta} />}
          </div>
        )}

        {/* Completed: recommendations (single line) */}
        {isCompleted && recs.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] text-text-tertiary shrink-0">권장</span>
            {recs.slice(0, 3).map(rec => {
              const meta = PRIORITY_CHIP[rec.priority]
              return (
                <span
                  key={rec.name}
                  className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${meta?.chip ?? 'bg-surface-sunken text-text-secondary border-border'}`}
                >
                  {rec.name}
                </span>
              )
            })}
            {recs.length > 3 && (
              <span className="text-[10px] text-text-tertiary self-center">+{recs.length - 3}</span>
            )}
          </div>
        )}

        {/* Completed: customer comment (single line) */}
        {isCompleted && comment && (
          <p className="text-[11px] text-text-secondary leading-snug break-keep line-clamp-1">
            <span className="text-text-tertiary mr-1">전달</span>
            {comment}
          </p>
        )}
      </Link>

      {/* Drive button (only when URL exists) */}
      {driveFolderUrl && (
        <a
          href={driveFolderUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1 border-t border-border-subtle px-3 py-1.5 text-[11px] font-semibold text-brand-600 hover:bg-brand-50/50 transition-colors"
        >
          <FolderOpen size={12} />
          관리 자료 보기
        </a>
      )}
    </div>
  )
}
