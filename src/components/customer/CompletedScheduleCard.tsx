'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { FolderOpen } from 'lucide-react'
import { ServiceSchedule } from '@/types/database'

export type CompletedScheduleData = ServiceSchedule & {
  worker?: { name?: string } | null
  closing_checklists?: Array<{
    condition_score: number | null
    recommended_services: unknown
    customer_comment: string | null
  }> | null
}

type RatingMeta = { label: string; bg: string; text: string; border: string; dot: string }

const CONDITION_META: Record<number, RatingMeta> = {
  1: { label: '양호', bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', dot: 'bg-green-500' },
  2: { label: '주의', bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', dot: 'bg-yellow-500' },
  3: { label: '불량', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500' },
}

const UNRATED_META: RatingMeta = {
  label: '미입력', bg: 'bg-surface-sunken', text: 'text-text-tertiary', border: 'border-border', dot: 'bg-text-tertiary',
}

const STATUS_COMPLETED_META: RatingMeta = {
  label: '완료', bg: 'bg-brand-50', text: 'text-brand-700', border: 'border-brand-200', dot: 'bg-brand-600',
}

const PRIORITY_CHIP: Record<string, { label: string; chip: string }> = {
  high: { label: '불량', chip: 'bg-red-50 text-red-700 border-red-200' },
  medium: { label: '주의', chip: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  low: { label: '관심', chip: 'bg-surface-sunken text-text-secondary border-border' },
}

/**
 * 범위 외 쾌적은 recommended_services priority 중 "가장 나쁜 것"으로 표현.
 * worker가 권장 서비스를 모두 입력해 둔 우선순위를 기반으로 도출 (worker 버튼 입력 그대로 반영).
 */
function deriveOuterRating(recs: Array<{ priority: string }>): RatingMeta {
  if (recs.length === 0) return CONDITION_META[1] // 권장 사항 없음 = 양호
  const priorities = new Set(recs.map(r => r.priority))
  if (priorities.has('high')) return CONDITION_META[3]   // 불량
  if (priorities.has('medium')) return CONDITION_META[2] // 주의
  return CONDITION_META[1] // 관심만 있거나 그 외 = 양호
}

function StatusPill({ label, meta }: { label: string; meta: RatingMeta }) {
  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      <span className="text-[9px] font-semibold text-text-tertiary uppercase tracking-wide">{label}</span>
      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border w-fit ${meta.bg} ${meta.border} ${meta.text}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
        {meta.label}
      </span>
    </div>
  )
}

interface Props {
  schedule: CompletedScheduleData
  detailHref: string
  driveFolderUrl?: string | null
}

export function CompletedScheduleCard({ schedule, detailHref, driveFolderUrl }: Props) {
  const scheduledDate = new Date(schedule.scheduled_date)
  const closing = schedule.closing_checklists?.[0] ?? null
  const conditionScore = closing?.condition_score ?? null
  const recs = Array.isArray(closing?.recommended_services)
    ? (closing!.recommended_services as Array<{ name: string; reason?: string; priority: string }>)
    : []
  const comment = closing?.customer_comment ?? null
  const workerName = schedule.worker?.name ?? null

  const comfortMeta = conditionScore != null ? CONDITION_META[conditionScore] : UNRATED_META
  const outerMeta = deriveOuterRating(recs)

  return (
    <div className="bg-surface rounded-2xl border border-border-subtle shadow-flat overflow-hidden">
      <Link
        href={detailHref}
        className="block p-4 flex flex-col gap-3 active:scale-[0.98] transition-transform"
      >
        {/* 헤더: 날짜 + 담당자 */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-text-primary">
              {format(scheduledDate, 'M월 d일 (EEE)', { locale: ko })}
            </p>
            {workerName && (
              <p className="text-[11px] text-text-tertiary mt-0.5">담당 {workerName}</p>
            )}
          </div>
        </div>

        {/* 3개 status pill (대시보드 미니 버전) */}
        <div className="flex items-stretch gap-2 py-2 rounded-xl bg-surface-sunken/40 border border-border-subtle">
          <StatusPill label="쾌적 지수" meta={comfortMeta} />
          <div className="w-px bg-border-subtle" />
          <StatusPill label="범위 외 쾌적" meta={outerMeta} />
          <div className="w-px bg-border-subtle" />
          <StatusPill label="상태" meta={STATUS_COMPLETED_META} />
        </div>

        {/* 권장 서비스 */}
        {recs.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wide mb-1">권장 서비스</p>
            <div className="flex flex-wrap gap-1">
              {recs.slice(0, 3).map(rec => {
                const meta = PRIORITY_CHIP[rec.priority]
                return (
                  <span
                    key={rec.name}
                    className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${meta?.chip ?? 'bg-surface-sunken text-text-secondary border-border'}`}
                  >
                    {rec.name}
                  </span>
                )
              })}
              {recs.length > 3 && (
                <span className="text-[10px] text-text-tertiary self-center">+{recs.length - 3}</span>
              )}
            </div>
          </div>
        )}

        {/* 고객 전달 특이사항 */}
        {comment && (
          <div>
            <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wide mb-1">전달 사항</p>
            <p className="text-xs text-text-secondary leading-relaxed break-keep line-clamp-2">{comment}</p>
          </div>
        )}
      </Link>

      {/* 드라이브 자료 버튼 (Link 외부 — 중첩 anchor 방지) */}
      {driveFolderUrl && (
        <a
          href={driveFolderUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 border-t border-border-subtle px-4 py-2.5 text-xs font-semibold text-brand-600 hover:bg-brand-50/50 transition-colors"
        >
          <FolderOpen size={14} />
          관리 자료 보기
        </a>
      )}
    </div>
  )
}
