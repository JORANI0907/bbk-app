'use client'

/**
 * 공간 보기 (2026-11-08) — 3D/평면 모형 → 구역 선택 → 구역 사진(평면 기본 · 360 선택) → 표시 클릭 → 카드 → 메뉴얼 품목으로
 *   고객·데모·관리자(편집) 공용. edit 가 있으면 편집 도구(사진 올리기·표시 찍기·층 지정)가 붙는다.
 *   3D 와 360 뷰어는 브라우저에서만 그린다 (dynamic, ssr:false).
 */

import dynamic from 'next/dynamic'
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Box, Camera, LayoutGrid, Loader2, Maximize2, Minimize2 } from 'lucide-react'
import type { RoomKind } from '@/types/care-manual'
import type { LabelMode } from './PlanBuilding'
import type { CareManualV2, CareManualZoneV2, PanoMarkerV2, PanoramaV2 } from '@/types/care-manual'
import { flattenManualItems, newManualId, photoKind } from '@/types/care-manual'
import type { ItemStatus, LatestChecks } from '@/lib/care-manual-status'
import { STATUS_HEX, zoneStatus } from '@/lib/care-manual-status'
import { ZONE_THEME } from '../zone-theme'
import { floorLabel, listFloors, zoneFloor } from './space-layout'
import { MarkerCard } from './MarkerCard'
import { DraftForm, FloorInput, MarkerList, MarkerTools, PanoStrip, type EditTool } from './SpaceEditPanel'
import type { MarkerVisual } from './PanoramaViewer'

const SpaceModel3D = dynamic(() => import('./SpaceModel3D'), { ssr: false, loading: () => <Loading text="3D 모형 준비 중…" /> })
const FloorMap2D = dynamic(() => import('./FloorMap2D'), { ssr: false })
const PanoramaViewer = dynamic(() => import('./PanoramaViewer'), { ssr: false, loading: () => <Loading text="360 사진 준비 중…" /> })
const FlatPhotoViewer = dynamic(() => import('./FlatPhotoViewer'), { ssr: false, loading: () => <Loading text="사진 준비 중…" /> })

export interface SpaceEditHandlers {
  uploading: boolean
  onAddPanorama: (zoneId: string, files: File[]) => Promise<void>
  onRemovePanorama: (zoneId: string, panoId: string) => void
  onRenamePanorama: (zoneId: string, panoId: string, title: string) => void
  onAddMarker: (zoneId: string, panoId: string, marker: PanoMarkerV2) => void
  onUpdateMarker: (zoneId: string, panoId: string, markerId: string, patch: Partial<PanoMarkerV2>) => void
  onRemoveMarker: (zoneId: string, panoId: string, markerId: string) => void
  onSetFloor: (zoneId: string, floor: number) => void
  /** 표시를 찍으면서 새 품목을 만들 때 — 만든 품목 id 를 돌려준다 */
  onCreateItem: (zoneId: string, title: string) => string
  /** 품목에 이미 올라간 사진을 구역 사진으로 가져온다 (재업로드 없음) */
  onImportItemPhoto: (zoneId: string, itemId: string, url: string) => void
}

/** 바깥(작업 목록·메뉴얼 목록)에서 "이 표시를 보여줘" — key 가 바뀔 때마다 적용 */
export interface MarkerFocus { panoId: string; markerId: string; key: number }

interface Props {
  manual: CareManualV2
  statuses: Record<string, ItemStatus>
  latest: LatestChecks
  activeZoneId: string | null
  onSelectZone: (zoneId: string) => void
  onGoToItem: (zoneId: string, itemId: string) => void
  focusMarker?: MarkerFocus | null
  edit?: SpaceEditHandlers
}

function Loading({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center gap-2 text-sm text-text-tertiary"><Loader2 size={16} className="animate-spin" /> {text}</div>
}

const NO_PLANS: NonNullable<CareManualV2['floor_plans']> = []

/** WebGL 지원 여부 — 한 번만 검사하고 캐시, 검사용 컨텍스트는 바로 해제 (탭을 오갈 때마다 쌓이지 않게) */
let webglSupport: boolean | null = null
function hasWebGL(): boolean {
  if (webglSupport !== null) return webglSupport
  try {
    const c = document.createElement('canvas')
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null
    webglSupport = !!gl
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch { webglSupport = false }
  return webglSupport
}

/** 3D 캔버스가 죽어도 페이지는 살린다 — 평면 지도로 대체 */
class CanvasBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(e: Error) { console.error('[space] 3D 렌더 실패, 평면 지도로 대체:', e.message) }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

export function SpaceView({ manual, statuses, latest, activeZoneId, onSelectZone, onGoToItem, focusMarker = null, edit }: Props) {
  const zones = manual.zones
  const zone = zones.find(z => z.id === activeZoneId) ?? zones[0] ?? null
  const flat = useMemo(() => flattenManualItems(manual), [manual])
  const zoneStatuses = useMemo(() => Object.fromEntries(zones.map(z => [z.id, zoneStatus(z.id, manual, statuses)])), [zones, manual, statuses])
  const floorPlans = manual.floor_plans ?? NO_PLANS
  const floors = useMemo(
    () => Array.from(new Set([...listFloors(zones), ...floorPlans.map(p => p.floor)])).sort((a, b) => a - b),
    [zones, floorPlans],
  )

  /** null = WebGL 검사 전 (그동안 3D 를 섣불리 그리지 않는다) */
  const [mode, setMode] = useState<'3d' | 'map' | null>(null)
  const [floor, setFloor] = useState<number | null>(null)
  /** 도면 모형: 보여줄 공간 종류 (기본 호실·복도) · 이름 표시 양 · 크게 보기 · 카메라 다가가기 트리거 */
  const [kinds, setKinds] = useState<ReadonlySet<RoomKind>>(() => new Set<RoomKind>(['room', 'corridor', 'core']))
  const [labelMode, setLabelMode] = useState<LabelMode>('zones')
  const [expanded, setExpanded] = useState(false)
  const [focusNonce, setFocusNonce] = useState(0)
  const toggleKind = (k: RoomKind) => setKinds(prev => {
    const next = new Set(prev)
    if (next.has(k)) { if (next.size > 1) next.delete(k) } else next.add(k)
    return next
  })
  const [panoId, setPanoId] = useState<string | null>(null)
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null)
  const [tool, setTool] = useState<EditTool>('none')
  const [pending, setPending] = useState<[number, number][]>([])
  const [draft, setDraft] = useState<Omit<PanoMarkerV2, 'id' | 'item_id'> | null>(null)

  useEffect(() => { setMode(hasWebGL() ? '3d' : 'map') }, [])
  useEffect(() => { if (floor !== null && !floors.includes(floor)) setFloor(null) }, [floors, floor])

  const panoramas = zone?.panoramas ?? []
  const pano: PanoramaV2 | null = panoramas.find(p => p.id === panoId) ?? panoramas[0] ?? null
  /** 바깥에서 지정한 표시 — 사진이 바뀐 뒤(아래 초기화 effect) 선택으로 넘겨준다 */
  const pendingMarker = useRef<{ panoId: string; markerId: string } | null>(null)
  const panoSectionRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!focusMarker) return
    pendingMarker.current = { panoId: focusMarker.panoId, markerId: focusMarker.markerId }
    setPanoId(focusMarker.panoId)
    // 목록에서 넘어온 경우 3D 아래에 있는 구역 사진이 바로 보이도록 스크롤
    setTimeout(() => panoSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120)
    if (pano?.id === focusMarker.panoId) {
      // 사진이 이미 그 사진이면 바로 선택. 같은 커밋의 초기화 effect(처음 열릴 때)가 이 값을 유지하도록 ref 는 다음 틱에 비운다
      setSelectedMarkerId(focusMarker.markerId)
      const t = setTimeout(() => { pendingMarker.current = null }, 0)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusMarker?.key])
  useEffect(() => {
    const keep = pendingMarker.current && pendingMarker.current.panoId === pano?.id ? pendingMarker.current.markerId : null
    pendingMarker.current = null
    setSelectedMarkerId(keep); setPending([]); setDraft(null); setTool('none')
  }, [zone?.id, pano?.id])

  const selectZone = useCallback((id: string) => {
    onSelectZone(id)
    setPanoId(null)
    setFocusNonce(n => n + 1)
    const f = zones.find(z => z.id === id)
    if (f && floor !== null && zoneFloor(f) !== floor) setFloor(null)
  }, [onSelectZone, zones, floor])

  const visuals: MarkerVisual[] = useMemo(() => (pano?.markers ?? []).map(m => {
    const f = flat.find(x => x.item.id === m.item_id)
    return { marker: m, color: STATUS_HEX[statuses[m.item_id] ?? 'none'], label: f?.item.title || '삭제된 품목', index: f?.index ?? 0 }
  }), [pano, flat, statuses])

  const selectedMarker = pano?.markers.find(m => m.id === selectedMarkerId) ?? null
  const selectedFlat = selectedMarker ? flat.find(x => x.item.id === selectedMarker.item_id) ?? null : null

  // ─── 편집: 사진 위 클릭 ─────────────────────────────────────────
  // 평면 사진은 (x, y) 0~1, 360 사진은 (yaw, pitch) 라디안 — 같은 자리에 들어오지만 저장 필드가 다르다
  const isFlat = pano ? photoKind(pano) === 'flat' : false
  const onPlace = edit && tool !== 'none' && pano ? (a: number, b: number) => {
    if (tool === 'point') { setDraft(isFlat ? { type: 'point', x: a, y: b } : { type: 'point', yaw: a, pitch: b }); setTool('none'); return }
    setPending(p => [...p, [a, b]])
  } : undefined
  const finishPolygon = () => { if (pending.length >= 3) { setDraft({ type: 'polygon', points: pending }); setPending([]); setTool('none') } }
  const commitDraft = (itemId: string, note: string) => {
    if (!zone || !pano || !draft || !edit) return
    const marker: PanoMarkerV2 = { id: newManualId(), item_id: itemId, ...draft, ...(note.trim() ? { note: note.trim() } : {}) }
    edit.onAddMarker(zone.id, pano.id, marker)
    setDraft(null)
    setSelectedMarkerId(marker.id)
  }

  if (zones.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      {/* 모형 */}
      <section className="overflow-hidden rounded-2xl border border-border-subtle bg-gradient-to-b from-sky-50/70 to-surface shadow-soft">
        <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle bg-surface/80 px-3 py-2">
          <Segment value={mode ?? '3d'} onChange={setMode} options={[{ value: '3d', label: '3D', icon: <Box size={13} /> }, { value: 'map', label: '평면', icon: <LayoutGrid size={13} /> }]} />
          <div className="ml-auto flex items-center gap-1 overflow-x-auto">
            {floors.length > 1 && (
              <>
                <Chip active={floor === null} onClick={() => setFloor(null)}>전체</Chip>
                {[...floors].reverse().map(f => <Chip key={f} active={floor === f} onClick={() => setFloor(f)}>{floorLabel(f)}</Chip>)}
              </>
            )}
            <button type="button" onClick={() => setExpanded(v => !v)} className="ml-1 rounded-lg p-1.5 text-text-tertiary hover:bg-surface-sunken hover:text-text-primary" aria-label={expanded ? '작게 보기' : '크게 보기'} title={expanded ? '작게 보기' : '크게 보기'}>
              {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </div>
        </div>
        {mode === '3d' && floorPlans.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border-subtle bg-surface/60 px-3 py-1.5 text-xs">
            <span className="text-text-tertiary">보기</span>
            <div className="flex items-center gap-1">
              {([['room', '호실'], ['corridor', '복도·홀'], ['core', '계단·공용부'], ['outdoor', '외부']] as [RoomKind, string][]).map(([k, label]) => (
                <Chip key={k} active={kinds.has(k)} onClick={() => toggleKind(k)}>{label}</Chip>
              ))}
            </div>
            <span className="text-text-tertiary">이름</span>
            <Segment value={labelMode} onChange={setLabelMode} options={[{ value: 'zones', label: '구역만', icon: null }, { value: 'all', label: '전부', icon: null }, { value: 'none', label: '숨김', icon: null }]} />
          </div>
        )}
        <div className={`relative transition-[height] duration-300 ${expanded ? 'h-[70vh] min-h-[420px]' : 'h-60 sm:h-72'}`}>
          {mode === null && <Loading text="준비 중…" />}
          {mode === '3d' && (
            <CanvasBoundary fallback={<FloorMap2D zones={zones} zoneStatuses={zoneStatuses} selectedZoneId={zone?.id ?? null} onSelectZone={selectZone} floorPlans={floorPlans} floor={floor} />}>
              <SpaceModel3D
                zones={zones} zoneStatuses={zoneStatuses} selectedZoneId={zone?.id ?? null} onSelectZone={selectZone}
                modelUrl={manual.space_model_url} floorPlans={floorPlans} floor={floor}
                visibleKinds={kinds} labelMode={labelMode} focusNonce={focusNonce}
              />
            </CanvasBoundary>
          )}
          {mode === 'map' && <FloorMap2D zones={zones} zoneStatuses={zoneStatuses} selectedZoneId={zone?.id ?? null} onSelectZone={selectZone} floorPlans={floorPlans} floor={floor} />}
          {mode === '3d' && (
            <p className="pointer-events-none absolute bottom-2 left-3 right-3 text-xs text-text-tertiary break-keep">
              드래그 회전 · 휠 확대 · 오른쪽 드래그 이동 · 구역을 누르면 카메라가 다가가고 구역 사진이 열립니다
              <span className="hidden sm:inline"> · 화면을 한 번 클릭한 뒤 방향키(←↑↓→)로 돌아다니기, PageUp/Down 높이, Shift 빠르게</span>
            </p>
          )}
        </div>
      </section>

      {/* 360 */}
      {zone && (
        <section ref={panoSectionRef} className="scroll-mt-4 overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-soft">
          <PanoHeader zone={zone} panoramas={panoramas} activeId={pano?.id ?? null} onSelect={setPanoId} showThumbs={!edit}>
            {edit && <FloorInput zone={zone} onChange={f => edit.onSetFloor(zone.id, f)} />}
          </PanoHeader>
          {edit && <PanoStrip zone={zone} panoramas={panoramas} activeId={pano?.id ?? null} onSelect={setPanoId} edit={edit} flat={flat} />}
          {pano ? (
            <div className="relative h-64 bg-black sm:h-80">
              {isFlat
                ? <FlatPhotoViewer imageUrl={pano.image_url} markers={visuals} selectedMarkerId={selectedMarkerId} onMarkerClick={id => { setSelectedMarkerId(id); setDraft(null) }} onPlace={onPlace} pendingPoints={pending} />
                : <PanoramaViewer imageUrl={pano.image_url} markers={visuals} selectedMarkerId={selectedMarkerId} onMarkerClick={id => { setSelectedMarkerId(id); setDraft(null) }} onPlace={onPlace} pendingPoints={pending} />}
              {edit && (
                <MarkerTools
                  tool={tool}
                  onTool={t => { setTool(t); setPending([]); setDraft(null); setSelectedMarkerId(null) }}
                  pendingCount={pending.length}
                  onFinishPolygon={finishPolygon}
                  onCancel={() => { setPending([]); setTool('none') }}
                />
              )}
            </div>
          ) : (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-sm text-text-tertiary">
              <Camera size={22} />
              <p>{edit ? '위의 [사진 올리기]로 이 구역 사진을 올리거나, 품목 사진을 가져오세요' : '이 구역의 사진은 준비 중입니다'}</p>
            </div>
          )}
          {edit && pano && draft && (
            <DraftForm zone={zone} zones={zones} flat={flat} onCommit={commitDraft} onCreateItem={edit.onCreateItem} onCancel={() => setDraft(null)} />
          )}
          {edit && pano && (
            <MarkerList
              pano={pano}
              flat={flat}
              statuses={statuses}
              selectedMarkerId={selectedMarkerId}
              onSelect={id => { setSelectedMarkerId(prev => (prev === id ? null : id)); setDraft(null) }}
              onRemove={id => { edit.onRemoveMarker(zone.id, pano.id, id); if (selectedMarkerId === id) setSelectedMarkerId(null) }}
            />
          )}
        </section>
      )}

      {selectedMarker && zone && pano && (
        <MarkerCard
          marker={selectedMarker}
          flat={selectedFlat}
          status={statuses[selectedMarker.item_id] ?? 'none'}
          latest={latest[selectedMarker.item_id]}
          onClose={() => setSelectedMarkerId(null)}
          onGoToItem={() => onGoToItem(zone.id, selectedMarker.item_id)}
          edit={edit ? {
            onNote: note => edit.onUpdateMarker(zone.id, pano.id, selectedMarker.id, { note: note || undefined }),
            onRemove: () => { if (confirm('이 표시를 삭제할까요?')) { edit.onRemoveMarker(zone.id, pano.id, selectedMarker.id); setSelectedMarkerId(null) } },
          } : undefined}
        />
      )}
    </div>
  )
}

// ─── 조각들 ─────────────────────────────────────────────────────────
function PanoHeader({ zone, panoramas, activeId, onSelect, showThumbs, children }: {
  zone: CareManualZoneV2; panoramas: PanoramaV2[]; activeId: string | null; onSelect: (id: string) => void; showThumbs: boolean; children?: React.ReactNode
}) {
  const t = ZONE_THEME[zone.color]
  return (
    <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${t.dot}`} />
      <span className="shrink-0 text-sm font-bold text-text-primary">{zone.name || '이름 없는 구역'}</span>
      <span className="shrink-0 text-xs text-text-tertiary">{floorLabel(zoneFloor(zone))}</span>
      {children}
      {showThumbs && panoramas.length > 1 && (
        <div className="ml-auto flex items-center gap-1.5 overflow-x-auto">
          {panoramas.map((p, i) => (
            <button key={p.id} type="button" onClick={() => onSelect(p.id)} className={`shrink-0 overflow-hidden rounded-lg ring-2 transition-all ${p.id === activeId ? 'ring-brand-600' : 'ring-transparent opacity-70 hover:opacity-100'}`} title={p.title || `지점 ${i + 1}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumb_url ?? p.image_url} alt={p.title} className="h-8 w-14 object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Segment<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; icon: React.ReactNode | null }[] }) {
  return (
    <div className="inline-flex rounded-lg bg-surface-sunken p-0.5">
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${value === o.value ? 'bg-surface text-text-primary shadow-segment' : 'text-text-secondary'}`}>
          {o.icon} {o.label}
        </button>
      ))}
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${active ? 'bg-text-primary text-white' : 'bg-surface-sunken text-text-secondary hover:bg-border-subtle'}`}>
      {children}
    </button>
  )
}
