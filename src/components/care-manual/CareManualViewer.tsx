'use client'

/**
 * 케어매뉴얼 보기 (고객 포털 · 데모 · 관리자 읽기 전용 공용)
 *   구역 탭 → 작업 묶음 카드 → 번호 매긴 작업 항목.
 *   편집 요소 없이 읽기 쉬운 데 집중: 지시문은 본문보다 반 단계 크고 줄 간격 넉넉.
 */

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Bell, BookOpen, CheckCircle2, ChevronDown, Loader2, Maximize2, X } from 'lucide-react'
import type { CareManualV2, CareManualItemV2, CareManualZoneV2, Frequency, ManualUpdate, MarkerRef } from '@/types/care-manual'
import { isManualEmpty } from '@/types/care-manual'
import type { CheckStatus, ItemStatus, LatestChecks } from '@/lib/care-manual-status'
import { fmtCheckDate } from '@/lib/care-manual-status'
import { ZONE_THEME, FREQUENCY_LABEL } from './zone-theme'
import { StatusChip } from './space/StatusChip'
import { MarkerRefList } from './space/MarkerRefList'
import styles from './care-manual.module.css'

/** 직원 점검 입력 — 완료(ok) 또는 특이사항(issue, 메모 필수) */
export type CheckHandler = (item: CareManualItemV2, zoneId: string, status: CheckStatus, memo: string) => Promise<void>

interface Props {
  manual: CareManualV2
  /** 휴대폰 현장용: 탭을 화면 아래에 고정 */
  bottomTabs?: boolean
  /** 비어 있을 때 보여줄 문구 */
  emptyText?: string
  emptyHint?: string
  /** 품목별 관리 상태 (있으면 상태 칩 표시) */
  statuses?: Record<string, ItemStatus>
  /** 품목별 최신 점검 1건 */
  latest?: LatestChecks
  /** 바깥에서 탭을 정하고 싶을 때 (공간 보기와 동기화) */
  activeZoneId?: string | null
  onActiveZoneChange?: (zoneId: string) => void
  /** 이 품목으로 스크롤 + 강조. focusKey 가 바뀔 때마다 다시 */
  focusItemId?: string | null
  focusKey?: number
  /** 있으면 직원 점검 버튼(완료·특이사항)이 붙는다 */
  onCheck?: CheckHandler
  /** 품목 → 사진 위 표시. onShowMarker 가 있으면 [사진에서 보기] 가 붙는다 */
  markerIndex?: Record<string, MarkerRef[]>
  onShowMarker?: (ref: MarkerRef) => void
}

export function CareManualViewer({
  manual, bottomTabs = false, emptyText = '케어매뉴얼이 아직 준비되지 않았습니다', emptyHint = '담당자에게 문의해주세요.',
  statuses, latest, activeZoneId, onActiveZoneChange, focusItemId = null, focusKey = 0, onCheck, markerIndex, onShowMarker,
}: Props) {
  const zones = manual.zones
  const [innerActiveId, setInnerActiveId] = useState<string | null>(zones[0]?.id ?? null)
  const activeId = activeZoneId !== undefined ? activeZoneId : innerActiveId
  const setActiveId = (id: string | null) => { setInnerActiveId(id); if (id && onActiveZoneChange) onActiveZoneChange(id) }
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  /** 주기 필터 — 'all' 이면 전부, 'none' 이면 주기 미지정만 (2026-11-09) */
  const [freq, setFreq] = useState<FreqFilter>('all')
  const freqCounts = useMemo(() => countByFrequency(zones), [zones])
  useEffect(() => {
    if (activeZoneId === undefined && !zones.some(z => z.id === innerActiveId)) setInnerActiveId(zones[0]?.id ?? null)
  }, [zones, innerActiveId, activeZoneId])
  const active = useMemo(() => zones.find(z => z.id === activeId) ?? zones[0] ?? null, [zones, activeId])

  // 공간 보기에서 "메뉴얼에서 보기" → 해당 구역 탭으로 바꾸고 품목까지 스크롤
  useEffect(() => {
    if (!focusItemId) return
    const zone = zones.find(z => z.groups.some(g => g.items.some(i => i.id === focusItemId)))
    if (zone && zone.id !== activeId) setActiveId(zone.id)
    setFreq('all')
    setHighlightId(focusItemId)
    const t = setTimeout(() => document.getElementById(`cm-item-${focusItemId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
    const t2 = setTimeout(() => setHighlightId(null), 2600)
    return () => { clearTimeout(t); clearTimeout(t2) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusItemId, focusKey])

  if (isManualEmpty(manual) || !active) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center bg-surface rounded-2xl border border-border-subtle">
        <BookOpen size={36} className="text-text-tertiary" />
        <p className="text-sm font-semibold text-text-primary">{emptyText}</p>
        <p className="text-xs text-text-tertiary">{emptyHint}</p>
      </div>
    )
  }

  const tabs = <ZoneTabs zones={zones} activeId={active.id} onSelect={setActiveId} />

  return (
    <div className={`flex flex-col gap-4 ${bottomTabs ? 'pb-20' : ''}`}>
      <UpdatesNotice updates={manual.updates ?? []} zones={zones} onSelectZone={setActiveId} />
      {!bottomTabs && tabs}
      <FrequencyFilter value={freq} counts={freqCounts} onChange={setFreq} />
      <ZonePanel key={active.id} zone={active} filter={freq} onImage={setLightbox} statuses={statuses} latest={latest} highlightId={highlightId} onCheck={onCheck} markerIndex={markerIndex} onShowMarker={onShowMarker} />
      {bottomTabs && (
        <div className={`fixed inset-x-0 bottom-0 z-30 border-t border-border-subtle bg-surface/95 backdrop-blur px-3 py-2 ${styles.bottomTabs}`}>
          {tabs}
        </div>
      )}
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}

// ─── 최신화 알림창 ─────────────────────────────────────────────────
const fmtUpdateDate = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}

/**
 * 상단 알림창 — 최근 최신화된 구역 이름만 (내용은 넣지 않음). 3개까지 보이고 더보기로 펼친다.
 *   클릭하면 그 구역 탭으로 이동. onDismiss 가 있으면(관리자) 항목을 알림창에서만 지울 수 있다.
 */
export function UpdatesNotice({ updates, zones, onSelectZone, onDismiss }: {
  updates: ManualUpdate[]
  zones: CareManualZoneV2[]
  onSelectZone: (zoneId: string) => void
  onDismiss?: (updateId: string) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const visible = updates.filter(u => zones.some(z => z.id === u.zone_id))
  if (visible.length === 0) return null
  const rows = showAll ? visible : visible.slice(0, 3)
  return (
    <div className={`${styles.reveal} rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3`}>
      <div className="flex items-center gap-2 text-xs font-semibold text-sky-800">
        <Bell size={14} className="text-sky-500" /> 최근 최신화
      </div>
      <ul className="mt-2 space-y-1">
        {rows.map(u => {
          const zone = zones.find(z => z.id === u.zone_id)
          const t = zone ? ZONE_THEME[zone.color] : null
          return (
            <li key={u.id} className="flex items-center gap-2">
              <button type="button" onClick={() => onSelectZone(u.zone_id)} className="group flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left text-sm transition-colors hover:bg-white/70">
                {t && <span className={`h-2 w-2 shrink-0 rounded-full ${t.dot}`} />}
                <span className="truncate font-medium text-text-primary group-hover:underline">{zone?.name || u.zone_name || '구역'} 구역 최신화</span>
                <span className="shrink-0 text-xs text-text-tertiary">{fmtUpdateDate(u.at)}</span>
              </button>
              {onDismiss && (
                <button type="button" onClick={() => onDismiss(u.id)} className="rounded-md p-1 text-text-tertiary transition-colors hover:bg-white hover:text-rose-600" aria-label="알림에서 지우기" title="알림창에서만 지웁니다 (내용은 그대로)">
                  <X size={13} />
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {visible.length > 3 && (
        <button type="button" onClick={() => setShowAll(v => !v)} className="mt-1 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-white/70">
          {showAll ? '접기' : `더보기 (${visible.length - 3})`}
          <ChevronDown size={13} className={`transition-transform ${showAll ? 'rotate-180' : ''}`} />
        </button>
      )}
    </div>
  )
}

// ─── 탭 ───────────────────────────────────────────────────────────
export function ZoneTabs({ zones, activeId, onSelect, trailing, showLabel = true }: {
  zones: CareManualZoneV2[]
  activeId: string
  onSelect: (id: string) => void
  trailing?: React.ReactNode
  /** 앞에 "구역" 꼬리표 (상위 단계인 보기 모드와 구분) */
  showLabel?: boolean
}) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="tablist">
      {showLabel && <span className="mr-0.5 shrink-0 text-[11px] font-semibold tracking-wide text-text-tertiary">구역</span>}
      {zones.map(z => {
        const t = ZONE_THEME[z.color]
        const selected = z.id === activeId
        return (
          <button
            key={z.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(z.id)}
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${
              selected ? t.tabActive : `text-text-secondary ${t.tabHover}`
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${t.dot}`} />
            <span className="break-keep">{z.name || '이름 없는 구역'}</span>
          </button>
        )
      })}
      {trailing}
    </div>
  )
}

// ─── 구역 패널 ─────────────────────────────────────────────────────
// ─── 주기 필터 (2026-11-09) ────────────────────────────────────────
export type FreqFilter = 'all' | Frequency | 'none'
const FREQ_FILTER_ORDER: FreqFilter[] = ['all', 'every', 'weekly', 'biweekly', 'monthly', 'none']
const FREQ_FILTER_LABEL: Record<FreqFilter, string> = { all: '전체', ...FREQUENCY_LABEL, none: '주기 없음' } as Record<FreqFilter, string>

function matchesFrequency(item: CareManualItemV2, f: FreqFilter): boolean {
  if (f === 'all') return true
  if (f === 'none') return !item.frequency
  return item.frequency === f
}

/** 전체 구역 기준 주기별 품목 수 — 칩 옆 숫자용 */
function countByFrequency(zones: CareManualZoneV2[]): Record<FreqFilter, number> {
  const c: Record<FreqFilter, number> = { all: 0, every: 0, weekly: 0, biweekly: 0, monthly: 0, none: 0 }
  for (const z of zones) for (const g of z.groups) for (const i of g.items) {
    c.all += 1
    if (i.frequency && i.frequency in c) c[i.frequency] += 1
    else c.none += 1
  }
  return c
}

function FrequencyFilter({ value, counts, onChange }: { value: FreqFilter; counts: Record<FreqFilter, number>; onChange: (f: FreqFilter) => void }) {
  // 품목이 하나도 없는 주기는 칩을 만들지 않는다 (전체는 항상)
  const visible = FREQ_FILTER_ORDER.filter(f => f === 'all' || counts[f] > 0)
  if (visible.length <= 2) return null
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5" role="tablist" aria-label="주기별 보기">
      <span className="shrink-0 text-xs font-semibold text-text-tertiary">주기</span>
      {visible.map(f => {
        const on = value === f
        return (
          <button
            key={f} type="button" role="tab" aria-selected={on} onClick={() => onChange(f)}
            className={`inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-semibold transition-colors ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-border bg-surface text-text-secondary hover:border-brand-300 hover:text-brand-700'}`}
          >
            {FREQ_FILTER_LABEL[f]}
            <span className={`rounded-full px-1.5 text-[11px] ${on ? 'bg-white/20' : 'bg-surface-sunken text-text-tertiary'}`}>{counts[f]}</span>
          </button>
        )
      })}
    </div>
  )
}

function ZonePanel({ zone, filter, onImage, statuses, latest, highlightId, onCheck, markerIndex, onShowMarker }: {
  zone: CareManualZoneV2; filter: FreqFilter; onImage: (url: string) => void
  statuses?: Record<string, ItemStatus>; latest?: LatestChecks; highlightId: string | null; onCheck?: CheckHandler
  markerIndex?: Record<string, MarkerRef[]>; onShowMarker?: (ref: MarkerRef) => void
}) {
  const t = ZONE_THEME[zone.color]
  let n = 0
  // 주기 필터 — 맞는 품목이 하나도 없는 묶음은 통째로 숨긴다
  const groups = zone.groups
    .map(g => ({ ...g, items: g.items.filter(i => matchesFrequency(i, filter)) }))
    .filter(g => g.items.length > 0)
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g, gi) => (
        <section
          key={g.id}
          className={`${styles.reveal} relative overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-soft`}
          style={{ animationDelay: `${gi * 60}ms` }}
        >
          <span className={`absolute inset-y-0 left-0 w-1.5 ${t.bar}`} aria-hidden />
          <header className="pl-6 pr-5 pt-4 pb-3">
            <h2 className="text-base font-bold text-text-primary leading-snug break-keep">{g.title || '이름 없는 작업 묶음'}</h2>
            {g.summary && <p className="mt-0.5 text-sm text-text-secondary break-keep">{g.summary}</p>}
          </header>
          <ol className="divide-y divide-border-subtle">
            {g.items.map(item => {
              n += 1
              return (
                <ViewItem
                  key={item.id} item={item} index={n} badge={t.badge} onImage={onImage}
                  status={statuses?.[item.id]} latest={latest?.[item.id]} highlighted={highlightId === item.id}
                  onCheck={onCheck ? (status, memo) => onCheck(item, zone.id, status, memo) : undefined}
                  markerRefs={markerIndex?.[item.id] ?? []}
                  onShowMarker={onShowMarker}
                />
              )
            })}
          </ol>
        </section>
      ))}
      {zone.groups.length === 0 && (
        <p className="text-sm text-text-tertiary text-center py-10">이 구역에는 아직 작업이 없습니다.</p>
      )}
      {zone.groups.length > 0 && groups.length === 0 && (
        <p className="text-sm text-text-tertiary text-center py-10 break-keep">이 구역에는 &ldquo;{FREQ_FILTER_LABEL[filter]}&rdquo; 품목이 없습니다. 다른 구역 탭을 눌러 보세요.</p>
      )}
    </div>
  )
}

function ViewItem({ item, index, badge, onImage, status, latest, highlighted, onCheck, markerRefs = [], onShowMarker }: {
  item: CareManualItemV2; index: number; badge: string; onImage: (url: string) => void
  status?: ItemStatus; latest?: LatestChecks[string]; highlighted: boolean
  onCheck?: (status: CheckStatus, memo: string) => Promise<void>
  markerRefs?: MarkerRef[]; onShowMarker?: (ref: MarkerRef) => void
}) {
  return (
    <li id={`cm-item-${item.id}`} className={`pl-6 pr-5 py-4 flex gap-3 transition-colors ${highlighted ? styles.focusPulse : ''}`}>
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${badge}`}>{index}</span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-text-primary leading-snug break-keep">{item.title || '이름 없는 품목'}</h3>
          {item.frequency && (
            <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-medium text-text-secondary">{FREQUENCY_LABEL[item.frequency] ?? item.frequency}</span>
          )}
          {status && status !== 'none' && <StatusChip status={status} small />}
        </div>
        {latest && (
          <p className={`text-xs ${latest.status === 'issue' ? 'text-red-700' : 'text-text-tertiary'}`}>
            {latest.status === 'issue' ? '특이사항' : '점검 완료'} {fmtCheckDate(latest.checked_at)}{latest.worker_name ? ` · ${latest.worker_name}` : ''}{latest.memo ? ` — ${latest.memo}` : ''}
          </p>
        )}
        {item.instructions && (
          <p className="text-base leading-relaxed text-text-secondary whitespace-pre-line break-keep">{item.instructions}</p>
        )}
        {item.caution && (
          <p className="text-sm leading-relaxed text-red-700 whitespace-pre-line break-keep"><span className="font-semibold">주의</span> {item.caution}</p>
        )}
        {item.images.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {item.images.map(url => (
              <button key={url} type="button" onClick={() => onImage(url)} className="group relative overflow-hidden rounded-xl border border-border-subtle active:scale-[0.98] transition-transform">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={item.title} className="h-24 w-24 object-cover" loading="lazy" />
                <span className="absolute bottom-1 right-1 rounded bg-black/55 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <Maximize2 size={12} />
                </span>
              </button>
            ))}
          </div>
        )}
        {onShowMarker && markerRefs.length > 0 && <MarkerRefList refs={markerRefs} onShow={onShowMarker} compact />}
        {onCheck && <CheckBar onCheck={onCheck} />}
      </div>
    </li>
  )
}

/** 직원 점검 버튼 — [완료] 한 번 · [특이사항] 은 메모를 적고 저장 */
function CheckBar({ onCheck }: { onCheck: (status: CheckStatus, memo: string) => Promise<void> }) {
  const [mode, setMode] = useState<'idle' | 'issue'>('idle')
  const [memo, setMemo] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async (status: CheckStatus) => {
    setBusy(true)
    try { await onCheck(status, memo); setMode('idle'); setMemo('') } finally { setBusy(false) }
  }
  return (
    <div className="pt-1">
      {mode === 'idle' ? (
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => void run('ok')} className="btn-toss inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-state-success-bg px-3 py-2 text-sm font-semibold text-green-800 hover:bg-green-200 disabled:opacity-50">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} 완료
          </button>
          <button type="button" disabled={busy} onClick={() => setMode('issue')} className="btn-toss inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-state-danger-bg px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-200 disabled:opacity-50">
            <AlertTriangle size={15} /> 특이사항
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50/60 p-3">
          <p className="text-xs text-red-700">이 메모와 작성자 이름은 고객 화면에도 그대로 보입니다. 고객이 읽는다고 생각하고 적어주세요.</p>
          <textarea autoFocus value={memo} onChange={e => setMemo(e.target.value)} rows={2} maxLength={500} placeholder="무엇이 문제인지 한두 줄 (예: 커피 얼룩 2곳, 다음 회차 약품 처리 예정)" className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-red-200" />
          <div className="flex gap-2">
            <button type="button" disabled={busy || !memo.trim()} onClick={() => void run('issue')} className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <AlertTriangle size={15} />} 특이사항 저장
            </button>
            <button type="button" onClick={() => { setMode('idle'); setMemo('') }} className="min-h-[40px] rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text-secondary hover:bg-surface-sunken">취소</button>
          </div>
        </div>
      )}
    </div>
  )
}

export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4" onClick={onClose}>
      <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70" aria-label="닫기">
        <X size={20} />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="max-h-[90vh] max-w-full rounded-xl object-contain" onClick={e => e.stopPropagation()} />
    </div>
  )
}
