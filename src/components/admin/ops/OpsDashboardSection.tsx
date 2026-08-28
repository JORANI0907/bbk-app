'use client'

/**
 * /admin 홈 최상단 운영 대시보드 섹션 (SPEC 4.5)
 * PLAN v2 §3.5
 *
 * 4블록:
 *  1. IntentBanner — 대표 의도
 *  2. Heartbeat 4타일 — 일일확인률·이번주공지·다음회의D-day·연속무사고일수
 *  3. 이달의 숫자 5타일 — 건수·클레임·재작업·이탈·재계약률
 *  4. 임박 항목 top 5 — deadlines
 *
 * admin role 만 렌더링 (호출측에서 통제).
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Activity, Megaphone, CalendarDays, ShieldCheck, Briefcase, AlertOctagon, Repeat, UserMinus, TrendingUp, Clock } from 'lucide-react'
import { IntentBanner } from './IntentBanner'
import { HeroNumberCard } from '@/components/ui/HeroNumberCard'
import type { StatusVariant } from '@/components/ui/StatusBadge'

interface DashboardResponse {
  ok: boolean
  intent: {
    purpose: string
    intent_1: string; intent_2: string; intent_3: string
    year: number
  }
  heartbeat: {
    daily_check_rate: { completed: number; reacted: number; pct: number | null }
    weekly_notice: { has_this_week: boolean; week_start: string }
    next_meeting_dday: { held_this_month: boolean; dday: number | null; month_end: string }
    safe_days: { count: number; start_date: string }
  }
  monthly_numbers: {
    jobs_count: number
    claims_count: number
    rework_count: number
    churn_count: number
    renewal_rate: number | null
  }
  deadlines: Array<{
    id: string
    title: string
    due_date: string
    category: string
    consequence: string
  }>
}

function dailyCheckStatus(pct: number | null): { variant: StatusVariant; label: string } {
  if (pct === null) return { variant: 'caution', label: '완료 없음' }
  if (pct >= 100) return { variant: 'normal', label: '완료' }
  if (pct >= 50)  return { variant: 'caution', label: '진행중' }
  return { variant: 'danger', label: '미반응' }
}

function ddayVariant(dday: number | null, held: boolean): { variant: StatusVariant; label: string } {
  if (held) return { variant: 'normal', label: '완료' }
  if (dday === null) return { variant: 'caution', label: '미정' }
  if (dday <= 3) return { variant: 'danger', label: `D-${dday}` }
  if (dday <= 7) return { variant: 'warning', label: `D-${dday}` }
  return { variant: 'normal', label: `D-${dday}` }
}

function deadlineDday(dueDate: string): number {
  const today = new Date().toISOString().slice(0, 10)
  const t1 = new Date(`${today}T00:00:00Z`).getTime()
  const t2 = new Date(`${dueDate}T00:00:00Z`).getTime()
  return Math.floor((t2 - t1) / (24 * 3600 * 1000))
}

interface OpsDashboardSectionProps {
  /** 대표 의도 배너 표시 여부 (홈에선 HomeIntentSection 이 별도로 표시하므로 dashboard 페이지에선 false) */
  showIntent?: boolean
}

export function OpsDashboardSection({ showIntent = true }: OpsDashboardSectionProps = {}) {
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/ops/dashboard')
      .then(r => r.json())
      .then((json: DashboardResponse) => {
        if (cancelled) return
        if (!json.ok) throw new Error('응답 실패')
        setData(json)
      })
      .catch(() => setError('대시보드 로드 실패'))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="bg-surface border border-border-subtle rounded-2xl p-6 text-xs text-text-tertiary text-center">
        운영 대시보드 로드 중…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-state-danger-bg border border-state-danger/20 rounded-2xl p-4 text-xs text-state-danger text-center">
        {error ?? '데이터 없음'}
      </div>
    )
  }

  const { intent, heartbeat, monthly_numbers, deadlines } = data

  const dailyStatus = dailyCheckStatus(heartbeat.daily_check_rate.pct)
  const noticeStatus: { variant: StatusVariant; label: string } = heartbeat.weekly_notice.has_this_week
    ? { variant: 'normal', label: '발행됨' }
    : { variant: 'warning', label: '미발행' }
  const meetingStatus = ddayVariant(heartbeat.next_meeting_dday.dday, heartbeat.next_meeting_dday.held_this_month)

  return (
    <section className="flex flex-col gap-4">
      {/* ─── 1. 대표 의도 배너 (홈에선 HomeIntentSection 이 대신 표시) ───────────────── */}
      {showIntent && (
        <IntentBanner
          purpose={intent.purpose}
          intent_1={intent.intent_1}
          intent_2={intent.intent_2}
          intent_3={intent.intent_3}
          year={intent.year}
        />
      )}

      {/* ─── 2. 심장박동 4타일 ─────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-1.5">
            <Activity size={14} /> 오늘의 심장박동
          </h2>
          <Link href="/admin/ops/settings/metrics" className="text-xs text-text-tertiary hover:text-brand-600">지표 설정</Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <HeroNumberCard
            icon={<Activity size={12} />}
            label="일일 확인률"
            value={heartbeat.daily_check_rate.pct}
            unit="%"
            status={dailyStatus.variant}
            statusLabel={dailyStatus.label}
            helper={`완료 ${heartbeat.daily_check_rate.completed} · 반응 ${heartbeat.daily_check_rate.reacted}`}
          />
          <HeroNumberCard
            icon={<Megaphone size={12} />}
            label="이번주 공지"
            value={heartbeat.weekly_notice.has_this_week ? '✓' : '—'}
            status={noticeStatus.variant}
            statusLabel={noticeStatus.label}
            helper={`주 시작 ${heartbeat.weekly_notice.week_start.slice(5)}`}
          />
          <HeroNumberCard
            icon={<CalendarDays size={12} />}
            label="다음 회의"
            value={heartbeat.next_meeting_dday.dday}
            unit="일 남음"
            status={meetingStatus.variant}
            statusLabel={meetingStatus.label}
            helper={heartbeat.next_meeting_dday.held_this_month ? '이달 개최됨' : `~${heartbeat.next_meeting_dday.month_end.slice(5)}`}
          />
          <HeroNumberCard
            icon={<ShieldCheck size={12} />}
            label="연속 무사고"
            value={heartbeat.safe_days.count}
            unit="일"
            status="normal"
            statusLabel="유지"
            helper={`기준 ${heartbeat.safe_days.start_date.slice(5)}`}
          />
        </div>
      </div>

      {/* ─── 3. 이달의 숫자 5타일 ──────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-1.5">
            <TrendingUp size={14} /> 이달의 숫자
          </h2>
          <Link href="/admin/reports" className="text-xs text-text-tertiary hover:text-brand-600">보고서</Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
          <HeroNumberCard icon={<Briefcase size={12} />}   label="완료 건수"  value={monthly_numbers.jobs_count}    unit="건" />
          <HeroNumberCard icon={<AlertOctagon size={12} />} label="클레임"    value={monthly_numbers.claims_count}  unit="건" status={monthly_numbers.claims_count === 0 ? 'normal' : 'caution'} statusLabel={monthly_numbers.claims_count === 0 ? '없음' : '발생'} />
          <HeroNumberCard icon={<Repeat size={12} />}       label="재작업"    value={monthly_numbers.rework_count}  unit="건" status={monthly_numbers.rework_count === 0 ? 'normal' : 'warning'} statusLabel={monthly_numbers.rework_count === 0 ? '없음' : '발생'} />
          <HeroNumberCard icon={<UserMinus size={12} />}    label="이탈 고객"  value={monthly_numbers.churn_count}   unit="건" status={monthly_numbers.churn_count === 0 ? 'normal' : 'caution'} statusLabel={monthly_numbers.churn_count === 0 ? '없음' : '이탈'} />
          <HeroNumberCard icon={<TrendingUp size={12} />}   label="재계약률"  value={monthly_numbers.renewal_rate}  unit="%" helper="지표 설정에서 활성화" />
        </div>
      </div>

      {/* ─── 4. 임박 항목 top 5 ───────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-1.5">
            <Clock size={14} /> 임박 항목
          </h2>
          <span className="text-xs text-text-tertiary">{deadlines.length}건</span>
        </div>
        {deadlines.length === 0 ? (
          <div className="bg-surface border border-border-subtle rounded-2xl p-4 text-xs text-text-tertiary text-center">
            임박 항목이 없습니다.
          </div>
        ) : (
          <ul className="bg-surface border border-border-subtle rounded-2xl divide-y divide-border-subtle overflow-hidden">
            {deadlines.map(d => {
              const dday = deadlineDday(d.due_date)
              const ddayCls = dday <= 3 ? 'text-state-danger' : dday <= 7 ? 'text-orange-700' : 'text-text-secondary'
              return (
                <li key={d.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-text-primary truncate">{d.title}</p>
                    <p className="text-xs text-text-tertiary truncate">{d.category} · {d.consequence}</p>
                  </div>
                  <div className={`text-xs font-bold whitespace-nowrap ${ddayCls}`}>
                    D-{dday}
                    <span className="ml-1 text-text-tertiary font-normal">{d.due_date.slice(5)}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
