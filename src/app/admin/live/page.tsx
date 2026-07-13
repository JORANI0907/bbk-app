'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Activity, AlertTriangle, CheckCircle2, Clock, MapPin, Phone,
  PlayCircle, PauseCircle, RefreshCw, Users, Zap, HelpCircle, X,
  Bell, Settings, ArrowRight,
} from 'lucide-react'
import Link from 'next/link'
import { getScheduleToday } from '@/lib/schedule-today'

// ─── 타입 ──────────────────────────────────────────────────────

interface LiveApplication {
  id: string
  business_name: string
  owner_name: string | null
  phone: string | null
  address: string | null
  construction_date: string | null
  construction_time: string | null
  service_type: string | null
  work_status: string | null           // 'pending' | 'in_progress' | 'completed'
  work_started_at: string | null
  work_completed_at: string | null
  worker_planned_departure: string | null
  worker_plan_note: string | null
  drive_folder_url: string | null
}

interface WorkAssignment {
  id: string
  worker_id: string
  application_id: string | null
}

interface Worker {
  id: string
  name: string
  employment_type: string | null
}

type ColumnKey = 'pre' | 'active' | 'post'

interface Column {
  key: ColumnKey
  label: string
  desc: string
  color: string
  bg: string
  border: string
}

const COLUMNS: Column[] = [
  { key: 'pre', label: '작업 전', desc: '출발 · 도착 대기', color: 'text-brand-700', bg: 'bg-brand-50/40', border: 'border-brand-200' },
  { key: 'active', label: '작업 중', desc: '진행 중', color: 'text-orange-700', bg: 'bg-orange-50/40', border: 'border-orange-200' },
  { key: 'post', label: '작업 후', desc: '완료', color: 'text-emerald-700', bg: 'bg-emerald-50/40', border: 'border-emerald-200' },
]

const REFRESH_INTERVAL_MS = 30_000

// ─── 헬퍼 ──────────────────────────────────────────────────────

function classifyStatus(app: LiveApplication): ColumnKey {
  if (app.work_status === 'completed') return 'post'
  if (app.work_status === 'in_progress') return 'active'
  return 'pre'
}

function timeStr(time: string | null): string {
  if (!time) return '-'
  return time.slice(0, 5)
}

function tsHHMM(ts: string | null): string {
  if (!ts) return '-'
  return new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

// 'HH:MM'을 오늘 KST 기준으로 분 단위로
function minutesOfTime(time: string | null): number | null {
  if (!time) return null
  const m = time.slice(0, 5).split(':').map(Number)
  if (m.length !== 2 || m.some(Number.isNaN)) return null
  return m[0] * 60 + m[1]
}

function currentKstMinutes(): number {
  const now = new Date()
  const kst = new Date(now.getTime() + (9 * 60 - now.getTimezoneOffset()) * 60000)
  return kst.getHours() * 60 + kst.getMinutes()
}

// 예정 소요 시간 (분): construction_time을 'HH:MM~HH:MM' 또는 'HH:MM' 형태로 파싱
function scheduledDurationMin(construction_time: string | null): number | null {
  if (!construction_time) return null
  const m = construction_time.match(/(\d{1,2}):(\d{2})\s*[~-]\s*(\d{1,2}):(\d{2})/)
  if (m) {
    const start = Number(m[1]) * 60 + Number(m[2])
    const end = Number(m[3]) * 60 + Number(m[4])
    return end > start ? end - start : null
  }
  // 종료 시각 없으면 기본 120분(2시간) 가정
  return 120
}

function elapsedSinceStart(started: string | null): number | null {
  if (!started) return null
  const diffMin = Math.floor((Date.now() - new Date(started).getTime()) / 60000)
  return diffMin < 0 ? null : diffMin
}

interface Alerts {
  lateArrival: boolean       // 출발/도착 시각 지났는데 시작 안 함
  lateArrivalMin: number
  lateDeparture: boolean     // 종료 시각 지났는데 완료 안 함
  lateDepartureMin: number
  overrun: boolean            // 예정 소요 대비 50% 초과 진행 중
  overrunPct: number
}

function computeAlerts(app: LiveApplication): Alerts {
  const nowMin = currentKstMinutes()
  const startMin = minutesOfTime(app.construction_time)
  const dur = scheduledDurationMin(app.construction_time)
  const endMin = startMin != null && dur != null ? startMin + dur : null

  let lateArrival = false
  let lateArrivalMin = 0
  if (app.work_status !== 'completed' && !app.work_started_at && startMin != null) {
    const overdue = nowMin - startMin
    if (overdue > 10) {
      lateArrival = true
      lateArrivalMin = overdue
    }
  }

  let lateDeparture = false
  let lateDepartureMin = 0
  if (app.work_status !== 'completed' && app.work_started_at && endMin != null) {
    const overdue = nowMin - endMin
    if (overdue > 30) {
      lateDeparture = true
      lateDepartureMin = overdue
    }
  }

  let overrun = false
  let overrunPct = 0
  if (app.work_status === 'in_progress' && app.work_started_at && dur != null) {
    const elapsed = elapsedSinceStart(app.work_started_at) ?? 0
    if (elapsed > dur * 1.5) {
      overrun = true
      overrunPct = Math.round(((elapsed - dur) / dur) * 100)
    }
  }

  return { lateArrival, lateArrivalMin, lateDeparture, lateDepartureMin, overrun, overrunPct }
}

// ─── 페이지 ────────────────────────────────────────────────────

export default function LivePage() {
  const [apps, setApps] = useState<LiveApplication[]>([])
  const [assignments, setAssignments] = useState<WorkAssignment[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [nowTick, setNowTick] = useState(0)  // 시간 재계산 트리거

  const fetchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)

  const today = getScheduleToday()
  const month = today.slice(0, 7)

  const load = useCallback(async (silent: boolean) => {
    if (!silent) setInitialLoading(true)
    try {
      const [appRes, assRes, workerRes] = await Promise.all([
        fetch(`/api/admin/applications?month=${month}`),
        fetch(`/api/admin/work-assignments?month=${month}`),
        fetch('/api/admin/workers'),
      ])
      const [appJson, assJson, workerJson] = await Promise.all([
        appRes.json(), assRes.json(), workerRes.json(),
      ])

      const todayApps: LiveApplication[] = (appJson.applications ?? [])
        .filter((a: LiveApplication) => a.construction_date?.slice(0, 10) === today)

      setApps(todayApps)
      setAssignments(assJson.assignments ?? [])
      setWorkers(workerJson.workers ?? [])
      setLastUpdated(new Date())
    } catch {
      // 조용히 실패
    } finally {
      if (!silent) setInitialLoading(false)
    }
  }, [month, today])

  // 초기 로드 + 자동 갱신
  useEffect(() => {
    load(false)
  }, [load])

  useEffect(() => {
    if (fetchTimerRef.current) clearInterval(fetchTimerRef.current)
    if (autoRefresh) {
      fetchTimerRef.current = setInterval(() => load(true), REFRESH_INTERVAL_MS)
    }
    return () => {
      if (fetchTimerRef.current) clearInterval(fetchTimerRef.current)
    }
  }, [autoRefresh, load])

  // 매 60초마다 시간 표시 다시 계산
  useEffect(() => {
    tickTimerRef.current = setInterval(() => setNowTick(t => t + 1), 60_000)
    return () => {
      if (tickTimerRef.current) clearInterval(tickTimerRef.current)
    }
  }, [])

  // 배정 매핑
  const workerMap = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const a of assignments) {
      if (!a.application_id) continue
      const name = workers.find(w => w.id === a.worker_id)?.name
      if (!name) continue
      if (!map[a.application_id]) map[a.application_id] = []
      map[a.application_id].push(name)
    }
    return map
  }, [assignments, workers])

  // 컬럼별 분류
  const grouped = useMemo(() => {
    const g: Record<ColumnKey, LiveApplication[]> = { pre: [], active: [], post: [] }
    for (const a of apps) g[classifyStatus(a)].push(a)
    // 정렬: pre/active는 예정 시각 오름차순, post는 완료 시각 내림차순
    g.pre.sort((a, b) => (a.construction_time ?? '').localeCompare(b.construction_time ?? ''))
    g.active.sort((a, b) => (a.construction_time ?? '').localeCompare(b.construction_time ?? ''))
    g.post.sort((a, b) => (b.work_completed_at ?? '').localeCompare(a.work_completed_at ?? ''))
    return g
  }, [apps])

  // KPI
  const kpi = useMemo(() => {
    let alertCount = 0
    let totalWorkers = new Set<string>()
    for (const a of apps) {
      const alerts = computeAlerts(a)
      if (alerts.lateArrival || alerts.lateDeparture || alerts.overrun) alertCount++
      for (const n of workerMap[a.id] ?? []) totalWorkers.add(n)
    }
    return {
      total: apps.length,
      workers: totalWorkers.size,
      done: grouped.post.length,
      alerts: alertCount,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps, workerMap, grouped, nowTick])

  const todayLabel = new Date(today + 'T12:00:00').toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })

  return (
    <div className="flex flex-col h-full gap-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-text-primary">오늘의 현장</h1>
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-50 border border-red-100">
              <span className="relative flex h-2 w-2">
                <span className={`absolute inline-flex h-full w-full rounded-full bg-red-400 ${autoRefresh ? 'animate-ping' : ''} opacity-75`}></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              <span className="text-[10px] font-bold tracking-wide text-red-600">LIVE</span>
            </span>
          </div>
          <p className="text-sm text-text-secondary mt-1">{todayLabel}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setHelpOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-brand-200 bg-brand-50 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition-colors"
            title="사용법과 알림 규칙 안내"
          >
            <HelpCircle size={13} /> 설명 보기
          </button>
          <button
            onClick={() => setAutoRefresh(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-surface text-xs font-medium text-text-secondary hover:bg-surface-sunken transition-colors"
            title={autoRefresh ? '자동 갱신 켜짐' : '자동 갱신 꺼짐'}
          >
            {autoRefresh ? <PauseCircle size={13} /> : <PlayCircle size={13} />}
            자동 갱신 {autoRefresh ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={() => load(false)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-surface text-xs font-medium text-text-secondary hover:bg-surface-sunken transition-colors"
          >
            <RefreshCw size={13} /> 지금 갱신
          </button>
          {lastUpdated && (
            <span className="text-[11px] text-text-tertiary">
              {lastUpdated.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} 갱신
            </span>
          )}
        </div>
      </div>

      {/* KPI 요약 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={<AlertTriangle size={16} />}
          label="이상 감지"
          value={kpi.alerts}
          tone={kpi.alerts > 0 ? 'danger' : 'muted'}
          suffix="건"
        />
        <KpiCard
          icon={<Users size={16} />}
          label="투입 인력"
          value={kpi.workers}
          tone="brand"
          suffix="명"
        />
        <KpiCard
          icon={<Activity size={16} />}
          label="전체 현장"
          value={kpi.total}
          tone="muted"
          suffix="건"
        />
        <KpiCard
          icon={<CheckCircle2 size={16} />}
          label="완료"
          value={kpi.done}
          tone="success"
          suffix="건"
        />
      </div>

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}

      {/* Kanban 3열 */}
      {initialLoading ? (
        <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">불러오는 중...</div>
      ) : apps.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center py-20">
          <Activity size={40} className="text-text-tertiary" />
          <p className="text-text-tertiary text-sm">오늘 예정된 현장이 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 min-h-0">
          {COLUMNS.map(col => (
            <ColumnPanel
              key={col.key}
              column={col}
              apps={grouped[col.key]}
              workerMap={workerMap}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── KPI 카드 ─────────────────────────────────────────────────

function KpiCard({ icon, label, value, tone, suffix }: {
  icon: React.ReactNode
  label: string
  value: number
  tone: 'brand' | 'danger' | 'success' | 'muted'
  suffix?: string
}) {
  const toneMap = {
    brand:   { bg: 'bg-brand-50',    ic: 'text-brand-600',    val: 'text-brand-700' },
    danger:  { bg: 'bg-red-50',       ic: 'text-red-600',      val: 'text-red-700' },
    success: { bg: 'bg-emerald-50',   ic: 'text-emerald-600',  val: 'text-emerald-700' },
    muted:   { bg: 'bg-surface-sunken', ic: 'text-text-secondary', val: 'text-text-primary' },
  }[tone]

  return (
    <div className={`rounded-2xl border border-border-subtle bg-surface p-4 flex items-center gap-3 shadow-soft`}>
      <div className={`w-10 h-10 rounded-xl ${toneMap.bg} ${toneMap.ic} flex items-center justify-center shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-text-tertiary font-medium leading-tight">{label}</p>
        <p className={`text-xl font-bold ${toneMap.val} leading-tight mt-0.5`}>
          {value}<span className="text-xs font-medium text-text-tertiary ml-0.5">{suffix}</span>
        </p>
      </div>
    </div>
  )
}

// ─── 컬럼 ─────────────────────────────────────────────────────

function ColumnPanel({ column, apps, workerMap }: {
  column: Column
  apps: LiveApplication[]
  workerMap: Record<string, string[]>
}) {
  return (
    <section className={`rounded-2xl border ${column.border} ${column.bg} p-3 flex flex-col min-h-0`}>
      <header className="flex items-center justify-between px-1 pb-2 mb-2 border-b border-border-subtle/60">
        <div>
          <p className={`text-sm font-bold ${column.color}`}>{column.label}</p>
          <p className="text-[11px] text-text-tertiary">{column.desc}</p>
        </div>
        <span className={`text-xs font-bold ${column.color} bg-surface border border-border-subtle rounded-full px-2.5 py-0.5`}>
          {apps.length}
        </span>
      </header>
      <div className="flex flex-col gap-2 overflow-y-auto flex-1 min-h-[200px]">
        {apps.length === 0 ? (
          <div className="text-center py-8 text-[11px] text-text-tertiary">
            현장 없음
          </div>
        ) : (
          apps.map(app => (
            <LiveCard key={app.id} app={app} workers={workerMap[app.id] ?? []} column={column.key} />
          ))
        )}
      </div>
    </section>
  )
}

// ─── 카드 ─────────────────────────────────────────────────────

function LiveCard({ app, workers, column }: {
  app: LiveApplication
  workers: string[]
  column: ColumnKey
}) {
  const alerts = computeAlerts(app)
  const hasAlert = alerts.lateArrival || alerts.lateDeparture || alerts.overrun

  return (
    <div
      className={`rounded-xl bg-surface border p-3 shadow-flat transition-all ${
        hasAlert ? 'border-red-400 ring-2 ring-red-100 animate-pulse' : 'border-border-subtle hover:border-border'
      }`}
    >
      {/* 헤더: 업체명 + 상태 */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-text-primary truncate">{app.business_name}</p>
          {app.address && (
            <p className="text-[11px] text-text-tertiary truncate mt-0.5 flex items-center gap-1">
              <MapPin size={10} /> {app.address}
            </p>
          )}
        </div>
        {app.phone && (
          <a
            href={`tel:${app.phone}`}
            title={`${app.owner_name ?? ''} 전화`}
            className="shrink-0 w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center hover:bg-brand-100 transition-colors"
            onClick={e => e.stopPropagation()}
          >
            <Phone size={14} />
          </a>
        )}
      </div>

      {/* 시간 정보 */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-sunken text-[11px] text-text-secondary font-medium">
          <Clock size={11} />
          {column === 'post'
            ? `${tsHHMM(app.work_completed_at)} 완료`
            : column === 'active'
              ? `${tsHHMM(app.work_started_at)} 시작`
              : `예정 ${timeStr(app.construction_time)}`}
        </span>
        {app.worker_planned_departure && column === 'pre' && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-[11px] text-brand-700 font-medium">
            🚗 {timeStr(app.worker_planned_departure)} 출발 예정
          </span>
        )}
      </div>

      {/* 이상 감지 뱃지 */}
      {hasAlert && (
        <div className="mt-2 pt-2 border-t border-red-100 flex flex-col gap-1">
          {alerts.lateArrival && (
            <AlertBadge icon={<AlertTriangle size={11} />} text={`출근 지연 ${alerts.lateArrivalMin}분`} />
          )}
          {alerts.lateDeparture && (
            <AlertBadge icon={<AlertTriangle size={11} />} text={`퇴근 지연 ${alerts.lateDepartureMin}분`} />
          )}
          {alerts.overrun && (
            <AlertBadge icon={<Zap size={11} />} text={`소요 ${alerts.overrunPct}% 초과`} />
          )}
        </div>
      )}

      {/* 특이사항 */}
      {app.worker_plan_note && column === 'pre' && (
        <p className="mt-2 text-[11px] text-text-secondary leading-normal bg-brand-50/70 rounded-md px-2 py-1.5 line-clamp-2">
          💬 {app.worker_plan_note}
        </p>
      )}

      {/* 작업자 */}
      {workers.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {workers.map(name => (
            <span key={name} className="text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 py-0.5 rounded-md">
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function AlertBadge({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 border border-red-200 text-[11px] text-red-700 font-bold w-fit">
      {icon} {text}
    </span>
  )
}

// ─── 설명 모달 ─────────────────────────────────────────────

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface w-full max-w-2xl rounded-t-2xl md:rounded-2xl flex flex-col overflow-hidden shadow-modal max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center">
              <HelpCircle size={16} />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary leading-tight">오늘의 현장 · 사용 안내</h2>
              <p className="text-xs text-text-tertiary leading-tight mt-0.5">알림 규칙과 사용 방법</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-text-tertiary hover:bg-surface-sunken flex items-center justify-center"
          >
            <X size={16} />
          </button>
        </div>

        {/* 본문 */}
        <div className="overflow-y-auto flex-1 p-5 space-y-6">
          {/* 사용 흐름 */}
          <section>
            <SectionTitle icon={<Activity size={14} />} title="한눈에 보는 사용 흐름" />
            <ol className="space-y-2 text-sm text-text-secondary">
              <FlowStep num={1}>
                <b>직원이 아침에 배정관리 페이지</b>에서 오늘 배정된 현장을 열어
                <b> "내 계획" 편집기</b>에 출발 시각을 입력합니다 (자동 저장).
              </FlowStep>
              <FlowStep num={2}>
                <b>현장 도착 후 "▶ 작업 시작"</b>을 누르면 실제 출근 시각이 기록됩니다.
              </FlowStep>
              <FlowStep num={3}>
                <b>이 페이지(오늘의 현장)</b>는 30초마다 자동 갱신되며,
                모든 현장을 <b>작업 전 · 중 · 후</b> 3열로 실시간 관제합니다.
              </FlowStep>
              <FlowStep num={4}>
                <b>이상 상황 발생 시</b> 카드가 빨간 테두리로 강조되고,
                직원과 관리자에게 <b>동시 알림</b>이 발송됩니다.
              </FlowStep>
            </ol>
          </section>

          {/* 알림 규칙 3종 */}
          <section>
            <SectionTitle icon={<Bell size={14} />} title="알림이 발송되는 3가지 상황" />
            <div className="space-y-3">
              <AlertRule
                tone="danger"
                title="① 출근 지연 (Late Arrival)"
                trigger={<>예정 시각이 지났는데 <b>"작업 시작"을 누르지 않은 경우</b></>}
                threshold="기본 유예: 예정 시각 + 10분"
                receivers={['현장 직원 본인', '관리자']}
                example="예정 09:00 → 09:11부터 감지, 알림 발송"
              />
              <AlertRule
                tone="warning"
                title="② 퇴근 지연 (Late Departure)"
                trigger={<>예정 종료 시각이 지났는데 <b>"작업 완료"를 누르지 않은 경우</b></>}
                threshold="기본 유예: 예정 종료 시각 + 30분"
                receivers={['현장 직원 본인', '관리자']}
                example="예정 11:00 종료 → 11:31부터 감지, 알림 발송"
              />
              <AlertRule
                tone="warning"
                title="③ 소요 초과 (Overrun)"
                trigger={<>작업이 <b>예정 소요 시간의 150%를 넘긴 경우</b> (진행 중일 때)</>}
                threshold="기본 임계: 예정 소요의 +50%"
                receivers={['관리자만 (직원은 이미 작업 중)']}
                example="예정 2시간 → 3시간 초과 시 감지"
              />
            </div>
          </section>

          {/* 알림 채널 */}
          <section>
            <SectionTitle icon={<Zap size={14} />} title="알림 채널" />
            <ul className="space-y-1.5 text-sm text-text-secondary">
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-2 shrink-0" />
                <span><b>직원 앱 푸시 알림</b> — 브라우저에 앱을 저장(홈화면 추가)해두면 잠금화면까지 도착합니다</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-2 shrink-0" />
                <span><b>관리자 Slack</b> — BBK 워크스페이스 지정 채널에 즉시 발송</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary mt-2 shrink-0" />
                <span className="text-text-tertiary"><b>중복 방지</b> — 같은 현장의 같은 종류 알림은 하루에 1번만 발송됩니다</span>
              </li>
            </ul>
          </section>

          {/* 관리 방법 */}
          <section className="bg-brand-50/50 rounded-xl p-4 border border-brand-100">
            <SectionTitle icon={<Settings size={14} />} title="임계값·채널 관리는?" />
            <p className="text-sm text-text-secondary leading-normal mb-3">
              지각 유예 시간(10분), 퇴근 유예 시간(30분), 소요 초과 임계(50%)는
              <b> 푸시알림 관리 페이지의 "출퇴근 알림" 탭</b>에서 조정할 수 있습니다.
              발송 이력도 이 탭에서 확인 가능합니다.
            </p>
            <Link
              href="/admin/push?tab=attendance"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800"
            >
              푸시알림 관리로 이동 <ArrowRight size={13} />
            </Link>
          </section>
        </div>

        {/* 하단 */}
        <div className="border-t border-border-subtle px-5 py-3 shrink-0 bg-surface-sunken/40">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors"
          >
            이해했습니다
          </button>
        </div>
      </div>
    </div>
  )
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h3 className="flex items-center gap-1.5 text-sm font-bold text-text-primary mb-3">
      <span className="text-brand-600">{icon}</span> {title}
    </h3>
  )
}

function FlowStep({ num, children }: { num: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="shrink-0 w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center">
        {num}
      </span>
      <span className="leading-normal pt-0.5">{children}</span>
    </li>
  )
}

function AlertRule({ tone, title, trigger, threshold, receivers, example }: {
  tone: 'danger' | 'warning'
  title: string
  trigger: React.ReactNode
  threshold: string
  receivers: string[]
  example: string
}) {
  const toneMap = tone === 'danger'
    ? { bg: 'bg-red-50/50', border: 'border-red-200', title: 'text-red-700' }
    : { bg: 'bg-amber-50/50', border: 'border-amber-200', title: 'text-amber-700' }

  return (
    <div className={`rounded-xl border ${toneMap.border} ${toneMap.bg} p-3`}>
      <p className={`text-sm font-bold ${toneMap.title} mb-1.5`}>{title}</p>
      <p className="text-xs text-text-secondary leading-normal mb-2">
        <b className="text-text-primary">발동 조건:</b> {trigger}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-[11px]">
        <div className="bg-surface rounded-md px-2 py-1.5">
          <span className="text-text-tertiary">임계값</span>
          <p className="font-medium text-text-primary leading-tight mt-0.5">{threshold}</p>
        </div>
        <div className="bg-surface rounded-md px-2 py-1.5">
          <span className="text-text-tertiary">수신 대상</span>
          <p className="font-medium text-text-primary leading-tight mt-0.5">{receivers.join(' · ')}</p>
        </div>
      </div>
      <p className="text-[11px] text-text-tertiary mt-2 leading-normal">📋 예시: {example}</p>
    </div>
  )
}
