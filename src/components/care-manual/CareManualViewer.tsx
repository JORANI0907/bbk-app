'use client'

/**
 * 케어매뉴얼 보기 (고객 포털 · 데모 · 관리자 읽기 전용 공용)
 *   구역 탭 → 작업 묶음 카드 → 번호 매긴 작업 항목.
 *   편집 요소 없이 읽기 쉬운 데 집중: 지시문은 본문보다 반 단계 크고 줄 간격 넉넉.
 */

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Bell, BookOpen, ChevronDown, Maximize2, X } from 'lucide-react'
import type { CareManualV2, CareManualItemV2, CareManualZoneV2, ManualUpdate } from '@/types/care-manual'
import { isManualEmpty } from '@/types/care-manual'
import { ZONE_THEME, FREQUENCY_LABEL } from './zone-theme'
import styles from './care-manual.module.css'

interface Props {
  manual: CareManualV2
  /** 휴대폰 현장용: 탭을 화면 아래에 고정 */
  bottomTabs?: boolean
  /** 비어 있을 때 보여줄 문구 */
  emptyText?: string
  emptyHint?: string
}

export function CareManualViewer({ manual, bottomTabs = false, emptyText = '케어매뉴얼이 아직 준비되지 않았습니다', emptyHint = '담당자에게 문의해주세요.' }: Props) {
  const zones = manual.zones
  const [activeId, setActiveId] = useState<string | null>(zones[0]?.id ?? null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  useEffect(() => {
    if (!zones.some(z => z.id === activeId)) setActiveId(zones[0]?.id ?? null)
  }, [zones, activeId])
  const active = useMemo(() => zones.find(z => z.id === activeId) ?? zones[0] ?? null, [zones, activeId])

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
      <ZonePanel key={active.id} zone={active} onImage={setLightbox} />
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
export function ZoneTabs({ zones, activeId, onSelect, trailing }: {
  zones: CareManualZoneV2[]
  activeId: string
  onSelect: (id: string) => void
  trailing?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="tablist">
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
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors duration-150 ${
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
function ZonePanel({ zone, onImage }: { zone: CareManualZoneV2; onImage: (url: string) => void }) {
  const t = ZONE_THEME[zone.color]
  let n = 0
  return (
    <div className="flex flex-col gap-4">
      {zone.groups.map((g, gi) => (
        <section
          key={g.id}
          className={`${styles.reveal} relative overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-soft`}
          style={{ animationDelay: `${gi * 60}ms` }}
        >
          <span className={`absolute inset-y-0 left-0 w-1.5 ${t.bar}`} aria-hidden />
          <header className="pl-6 pr-5 pt-4 pb-3">
            <h2 className="text-base font-bold text-text-primary leading-snug break-keep">{g.title || '제목 없는 작업 묶음'}</h2>
            {g.summary && <p className="mt-0.5 text-sm text-text-secondary break-keep">{g.summary}</p>}
          </header>
          <ol className="divide-y divide-border-subtle">
            {g.items.map(item => {
              n += 1
              return <ViewItem key={item.id} item={item} index={n} badge={t.badge} onImage={onImage} />
            })}
          </ol>
        </section>
      ))}
      {zone.groups.length === 0 && (
        <p className="text-sm text-text-tertiary text-center py-10">이 구역에는 아직 작업이 없습니다.</p>
      )}
    </div>
  )
}

function ViewItem({ item, index, badge, onImage }: { item: CareManualItemV2; index: number; badge: string; onImage: (url: string) => void }) {
  return (
    <li className="pl-6 pr-5 py-4 flex gap-3">
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${badge}`}>{index}</span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-text-primary leading-snug break-keep">{item.title || '제목 없는 작업'}</h3>
          {item.frequency && (
            <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-medium text-text-secondary">{FREQUENCY_LABEL[item.frequency] ?? item.frequency}</span>
          )}
        </div>
        {item.instructions && (
          <p className="text-base leading-relaxed text-text-secondary whitespace-pre-line break-keep">{item.instructions}</p>
        )}
        {item.caution && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-800 break-keep">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-500" />
            <p className="whitespace-pre-line">{item.caution}</p>
          </div>
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
      </div>
    </li>
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
