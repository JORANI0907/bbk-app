'use client'

/**
 * 케어매뉴얼 편집기 (관리자)
 *   상단 저장 바(준비 · 공간 보기 · 작업 목록) → 구역 탭(이름 변경·색·순서·삭제) → 구역 패널
 *   준비 = 자료함 → 도면 분석 → 평면 그리기 → AI 초안. 구역이 없어도 열리며, 여기서 구역을 만든다 (2026-11-09 순서 정리)
 *   저장은 수동 (Ctrl/⌘+S 도 됨). 바뀐 내용이 있으면 "저장 안 됨" 점이 켜진다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Check, ChevronLeft, ChevronRight, FolderOpen, ListChecks, Loader2, Palette, Pencil, Plus, Save, Sparkles, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import type { AssetKind, CareManualV2, CareManualZoneV2, PanoMarkerV2, PanoramaV2, SpaceAssetV2, ZoneColor } from '@/types/care-manual'
import { ZONE_COLORS, countManualItems, emptyGroup, emptyItem, emptyZone, indexMarkersByItem, newManualId } from '@/types/care-manual'
import { ZONE_THEME } from './zone-theme'
import { ZoneTabs, Lightbox, UpdatesNotice } from './CareManualViewer'
import { ZoneEditor } from './ZoneEditor'
import { SpaceView, type MarkerFocus, type SpaceEditHandlers } from './space/SpaceView'
import { SpaceAssetsPanel } from './space/SpaceAssetsPanel'
import { AiDraftPanel } from './space/AiDraftPanel'
import { FloorPlanAnalyzePanel, mergeFloorPlans } from './space/FloorPlanAnalyzePanel'
import { FloorPlanEditor } from './space/FloorPlanEditor'
import { useManualImages } from './useManualImages'
import { useCareChecks } from './useCareChecks'
import styles from './care-manual.module.css'

/** setup(준비) → space(공간 보기) → list(작업 목록) 순서로 쓴다 (2026-11-09 사용자 결정) */
type EditorView = 'setup' | 'list' | 'space'

interface Props {
  customerId: string
  initial: CareManualV2
}

const STARTER_ZONES = ['주방', '홀', '화장실']

export function CareManualEditor({ customerId, initial }: Props) {
  const [manual, setManual] = useState<CareManualV2>(initial)
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(initial))
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(initial.zones[0]?.id ?? null)
  const [renaming, setRenaming] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)
  // 구역이 아직 없으면 준비 단계부터 시작한다
  const [view, setView] = useState<EditorView>(initial.zones.length === 0 ? 'setup' : 'list')
  /** 작업 목록 → [사진에서 보기] 로 넘어갈 때 공간 보기가 열어 줄 표시 */
  const [focusMarker, setFocusMarker] = useState<MarkerFocus | null>(null)
  const markerIndex = useMemo(() => indexMarkersByItem(manual), [manual])
  const showMarker = (ref: { zone_id: string; pano_id: string; marker_id: string }) => {
    setActiveId(ref.zone_id); setRenaming(false); setView('space')
    setFocusMarker(f => ({ panoId: ref.pano_id, markerId: ref.marker_id, key: (f?.key ?? 0) + 1 }))
  }
  const manualRef = useRef(manual)
  useEffect(() => { manualRef.current = manual }, [manual])
  const { upload, uploadPanorama, uploadAsset, remove, removeAsset, uploadingKey } = useManualImages(customerId)
  const { latest, statuses } = useCareChecks(customerId, manual)
  /** 구역 사진·자료 삭제는 저장이 성공한 뒤에 스토리지에서 지운다 (저장 안 하고 닫으면 DB 의 URL 이 살아 있어야 하므로) */
  const pendingDeletes = useRef<string[]>([])
  const pendingAssetDeletes = useRef<string[]>([])

  const dirty = JSON.stringify(manual) !== savedSnapshot
  const active = useMemo(() => manual.zones.find(z => z.id === activeId) ?? manual.zones[0] ?? null, [manual.zones, activeId])

  // ─── 저장 ───────────────────────────────────────────────────
  const save = useCallback(async (silent = false) => {
    const current = manualRef.current
    if (current.zones.length === 0 && countManualItems(initial) > 0) {
      if (!confirm('구역이 하나도 없습니다. 저장하면 기존 매뉴얼이 모두 지워집니다. 계속할까요?')) return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/customers/${customerId}/care-manual?t=${Date.now()}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        body: JSON.stringify({ manual: current }),
      })
      const body = await res.json().catch(() => ({})) as { error?: string; manual?: CareManualV2 }
      if (!res.ok) throw new Error(body.error ?? '저장 실패')
      // 서버가 최신화 기록(updates)을 붙여 돌려주므로 그 값을 화면 상태로 삼는다 (구역 편집 중 내용은 current 와 같음)
      const saved = body.manual ?? current
      setManual(saved)
      setSavedSnapshot(JSON.stringify(saved))
      const toDelete = pendingDeletes.current
      pendingDeletes.current = []
      toDelete.forEach(url => void remove(url))
      const assetsToDelete = pendingAssetDeletes.current
      pendingAssetDeletes.current = []
      assetsToDelete.forEach(url => void removeAsset(url))
      const now = new Date()
      setSavedAt(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)
      setFlash(true); setTimeout(() => setFlash(false), 900)
      if (!silent) toast.success(`저장됨 · 구역 ${current.zones.length}개 · 품목 ${countManualItems(current)}개`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }, [customerId, initial, remove, removeAsset])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save])

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // ─── 구역 조작 ───────────────────────────────────────────────
  const setZones = (zones: CareManualZoneV2[]) => setManual(m => ({ ...m, zones }))
  const patchZone = (id: string, patch: Partial<CareManualZoneV2>) => setZones(manual.zones.map(z => (z.id === id ? { ...z, ...patch } : z)))

  const addZone = (name = '') => {
    const z = emptyZone(name, manual.zones.length)
    setZones([...manual.zones, z])
    setActiveId(z.id)
    if (!name) setRenaming(true)
  }
  const addStarter = () => {
    const zones = STARTER_ZONES.map((n, i) => ({ ...emptyZone(n, i), groups: [emptyGroup()] }))
    setZones(zones)
    setActiveId(zones[0].id)
  }
  const removeZone = (z: CareManualZoneV2) => {
    const n = z.groups.reduce((s, g) => s + g.items.length, 0)
    if (!confirm(`"${z.name || '이름 없는 구역'}" 구역을 삭제할까요?${n > 0 ? ` 안의 품목 ${n}개도 함께 지워집니다.` : ''}`)) return
    const next = manual.zones.filter(x => x.id !== z.id)
    setZones(next)
    setActiveId(next[0]?.id ?? null)
  }
  const shiftZone = (z: CareManualZoneV2, dir: -1 | 1) => {
    const i = manual.zones.findIndex(x => x.id === z.id)
    const j = i + dir
    if (j < 0 || j >= manual.zones.length) return
    const next = [...manual.zones]
    ;[next[i], next[j]] = [next[j], next[i]]
    setZones(next)
  }
  const cycleColor = (z: CareManualZoneV2) => {
    const i = ZONE_COLORS.indexOf(z.color)
    patchZone(z.id, { color: ZONE_COLORS[(i + 1) % ZONE_COLORS.length] as ZoneColor })
  }
  const moveItemToZone = (itemId: string, fromGroupId: string, toZoneId: string) => {
    const fromZone = manual.zones.find(z => z.groups.some(g => g.id === fromGroupId))
    const item = fromZone?.groups.find(g => g.id === fromGroupId)?.items.find(i => i.id === itemId)
    if (!fromZone || !item) return
    setZones(manual.zones.map(z => {
      if (z.id === fromZone.id) return { ...z, groups: z.groups.map(g => (g.id === fromGroupId ? { ...g, items: g.items.filter(i => i.id !== itemId) } : g)) }
      if (z.id !== toZoneId) return z
      const groups = z.groups.length > 0 ? z.groups : [emptyGroup()]
      const last = groups[groups.length - 1]
      return { ...z, groups: groups.map(g => (g.id === last.id ? { ...g, items: [...g.items.filter(i => i.title || i.instructions), item] } : g)) }
    }))
  }

  const dismissUpdate = (updateId: string) => {
    setManual(m => ({ ...m, updates: (m.updates ?? []).filter(u => u.id !== updateId) }))
    toast('알림에서 지웠습니다. 저장을 누르면 반영됩니다.', { icon: '🔔' })
  }

  // ─── 사진 ─────────────────────────────────────────────────────
  const handleUpload = async (zoneId: string, groupId: string, itemId: string, files: File[]) => {
    const { urls, failed } = await upload(files, `${groupId}-${itemId}`)
    if (urls.length > 0) {
      setManual(m => ({
        ...m,
        zones: m.zones.map(z => z.id !== zoneId ? z : {
          ...z, groups: z.groups.map(g => g.id !== groupId ? g : { ...g, items: g.items.map(i => (i.id === itemId ? { ...i, images: [...i.images, ...urls] } : i)) }),
        }),
      }))
    }
    if (failed > 0) toast.error(`사진 ${failed}장을 올리지 못했습니다.`)
    else toast.success(`사진 ${urls.length}장 추가됨 · 저장을 눌러 반영하세요.`)
  }
  const handleRemoveImage = (zoneId: string, groupId: string, itemId: string, url: string) => {
    setManual(m => ({
      ...m,
      zones: m.zones.map(z => z.id !== zoneId ? z : {
        ...z, groups: z.groups.map(g => g.id !== groupId ? g : { ...g, items: g.items.map(i => (i.id === itemId ? { ...i, images: i.images.filter(u => u !== url) } : i)) }),
      }),
    }))
    void remove(url)
  }

  // ─── 공간 보기 (구역 사진 · 표시 · 층) ─────────────────────────────
  const patchPano = (zoneId: string, panoId: string, fn: (p: PanoramaV2) => PanoramaV2) =>
    setManual(m => ({ ...m, zones: m.zones.map(z => z.id !== zoneId ? z : { ...z, panoramas: (z.panoramas ?? []).map(p => (p.id === panoId ? fn(p) : p)) }) }))

  const spaceEdit: SpaceEditHandlers = {
    uploading: uploadingKey?.startsWith('pano-') ?? false,
    onAddPanorama: async (zoneId, files) => {
      const added: PanoramaV2[] = []
      for (const file of files) {
        const r = await uploadPanorama(file, `pano-${zoneId}-${Date.now()}`)
        if (r) added.push({ id: newManualId(), title: '', image_url: r.url, thumb_url: r.thumbUrl, ...(r.kind === 'flat' ? { kind: 'flat' as const } : {}), markers: [] })
      }
      if (added.length > 0) {
        setManual(m => ({ ...m, zones: m.zones.map(z => (z.id === zoneId ? { ...z, panoramas: [...(z.panoramas ?? []), ...added] } : z)) }))
        toast.success(`사진 ${added.length}장 추가됨 · 저장을 눌러 반영하세요.`)
      }
      if (added.length < files.length) toast.error(`사진 ${files.length - added.length}장을 올리지 못했습니다.`)
    },
    onRemovePanorama: (zoneId, panoId) => {
      const pano = manual.zones.find(z => z.id === zoneId)?.panoramas?.find(p => p.id === panoId)
      setManual(m => ({ ...m, zones: m.zones.map(z => (z.id === zoneId ? { ...z, panoramas: (z.panoramas ?? []).filter(p => p.id !== panoId) } : z)) }))
      // 품목 사진에서 가져온 사진은 품목 쪽에서 아직 쓰므로 파일을 지우지 않는다
      if (pano && !pano.source_item_id) pendingDeletes.current = [...pendingDeletes.current, pano.image_url, ...(pano.thumb_url ? [pano.thumb_url] : [])]
    },
    onImportItemPhoto: (zoneId, itemId, url) => {
      const item = manual.zones.flatMap(z => z.groups.flatMap(g => g.items)).find(i => i.id === itemId)
      const photo: PanoramaV2 = { id: newManualId(), title: item?.title ?? '', image_url: url, kind: 'flat', source_item_id: itemId, markers: [] }
      setManual(m => ({ ...m, zones: m.zones.map(z => (z.id === zoneId ? { ...z, panoramas: [...(z.panoramas ?? []), photo] } : z)) }))
      toast.success(`"${item?.title || '품목'}" 사진을 구역 사진으로 가져왔습니다. 표시를 찍고 저장하세요.`)
    },
    onRenamePanorama: (zoneId, panoId, title) => patchPano(zoneId, panoId, p => ({ ...p, title })),
    onAddMarker: (zoneId, panoId, marker) => patchPano(zoneId, panoId, p => ({ ...p, markers: [...p.markers, marker] })),
    onUpdateMarker: (zoneId, panoId, markerId, patch) => patchPano(zoneId, panoId, p => ({
      ...p, markers: p.markers.map(mk => (mk.id === markerId ? ({ ...mk, ...patch } as PanoMarkerV2) : mk)),
    })),
    onRemoveMarker: (zoneId, panoId, markerId) => patchPano(zoneId, panoId, p => ({ ...p, markers: p.markers.filter(mk => mk.id !== markerId) })),
    onSetFloor: (zoneId, floor) => setManual(m => ({ ...m, zones: m.zones.map(z => (z.id === zoneId ? { ...z, space: { ...(z.space ?? {}), floor } } : z)) })),
    // 사진에서 표시를 찍으며 새 품목 만들기 — 첫 작업 묶음에 넣고(없으면 "기본 작업" 묶음 생성), 빈 제목 품목이 있으면 그 자리를 채운다
    onCreateItem: (zoneId, title) => {
      const item = { ...emptyItem(), title }
      setManual(m => ({
        ...m,
        zones: m.zones.map(z => {
          if (z.id !== zoneId) return z
          const groups = z.groups.length > 0 ? z.groups : [{ ...emptyGroup(), title: '기본 작업', items: [] }]
          const [first, ...rest] = groups
          const blankIdx = first.items.findIndex(i => !i.title.trim() && !i.instructions.trim() && i.images.length === 0)
          const items = blankIdx >= 0 ? first.items.map((i, idx) => (idx === blankIdx ? { ...item, id: i.id } : i)) : [...first.items, item]
          return { ...z, groups: [{ ...first, items }, ...rest] }
        }),
      }))
      // 빈 품목 자리를 채운 경우 id 가 그 품목의 것이어야 하므로 여기서 다시 찾는다
      const z = manualRef.current.zones.find(x => x.id === zoneId)
      const blank = z?.groups[0]?.items.find(i => !i.title.trim() && !i.instructions.trim() && i.images.length === 0)
      return blank ? blank.id : item.id
    },
  }

  // ─── 자료함 (도면·건축물대장·참고사진) ───────────────────────────
  const assetEdit = {
    uploading: uploadingKey?.startsWith('asset-') ?? false,
    onUpload: async (files: File[], kind: AssetKind) => {
      const added: SpaceAssetV2[] = []
      for (const file of files) {
        const r = await uploadAsset(file, kind)
        if (r) added.push({ id: newManualId(), kind, title: file.name.replace(/\.[^.]+$/, ''), url: r.url, mime: r.mime, size: r.size, uploaded_at: new Date().toISOString() })
      }
      if (added.length > 0) {
        setManual(m => ({ ...m, assets: [...(m.assets ?? []), ...added] }))
        toast.success(`자료 ${added.length}개 추가됨 · 저장을 눌러 반영하세요.`)
      }
      if (added.length < files.length) toast.error(`자료 ${files.length - added.length}개를 올리지 못했습니다.`)
    },
    onPatch: (assetId: string, patch: Partial<SpaceAssetV2>) =>
      setManual(m => ({ ...m, assets: (m.assets ?? []).map(a => (a.id === assetId ? { ...a, ...patch } : a)) })),
    onRemove: (assetId: string) => {
      const target = manual.assets?.find(a => a.id === assetId)
      setManual(m => ({ ...m, assets: (m.assets ?? []).filter(a => a.id !== assetId) }))
      if (target) pendingAssetDeletes.current = [...pendingAssetDeletes.current, target.url]
    },
  }

  // ─── 화면 ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      <SaveBar dirty={dirty} saving={saving} savedAt={savedAt} flash={flash} onSave={() => void save()} view={view} onView={setView} />
      <StructureGuide view={view} />

      {view === 'setup' && (
        <SetupPanels
          customerId={customerId}
          manual={manual}
          assetEdit={assetEdit}
          onPlans={(plans, newZones) => {
            // 평면 교체 + 새 구역 추가 + 연결된 기존 구역의 층을 평면 층으로 맞춘다
            const floorByZone = new Map(plans.flatMap(p => p.rooms.filter(r => r.zone_id).map(r => [r.zone_id as string, p.floor] as const)))
            setManual(m => ({
              ...m,
              zones: [...m.zones.map(z => (floorByZone.has(z.id) ? { ...z, space: { ...(z.space ?? {}), floor: floorByZone.get(z.id)! } } : z)), ...newZones],
              floor_plans: mergeFloorPlans(m.floor_plans ?? [], plans),
            }))
            if (!activeId && newZones[0]) setActiveId(newZones[0].id)
          }}
          onFloorPlans={plans => setManual(m => ({ ...m, floor_plans: plans }))}
          onCreateZone={(name, floor) => {
            const z = { ...emptyZone(name, manual.zones.length), space: { floor } }
            setManual(m => ({ ...m, zones: [...m.zones, z] }))
            if (!activeId) setActiveId(z.id)
            return z.id
          }}
          onDraft={zones => { setZones([...manual.zones, ...zones]); setActiveId(zones[0]?.id ?? activeId); setView('list') }}
        />
      )}

      {manual.zones.length === 0 ? (
        <EmptyStart onStarter={() => { addStarter(); setView('list') }} onBlank={() => { addZone(); setView('list') }} onSetup={() => setView('setup')} inSetup={view === 'setup'} />
      ) : view === 'setup' ? (
        <p className="rounded-xl border border-border-subtle bg-surface px-4 py-3 text-sm text-text-secondary break-keep">
          구역 {manual.zones.length}개가 있습니다. 도면에서 방을 더 만들거나 AI 초안을 추가한 뒤, <button type="button" onClick={() => setView('space')} className="font-semibold text-brand-600 hover:underline">공간 보기</button>에서 사진을 올리고 <button type="button" onClick={() => setView('list')} className="font-semibold text-brand-600 hover:underline">작업 목록</button>에서 품목을 적으세요.
        </p>
      ) : (
        <>
          <UpdatesNotice updates={manual.updates ?? []} zones={manual.zones} onSelectZone={id => { setActiveId(id); setRenaming(false) }} onDismiss={dismissUpdate} />
          <div className="rounded-2xl border border-border-subtle bg-surface px-3 py-2 shadow-soft">
            <ZoneTabs
              zones={manual.zones}
              activeId={active?.id ?? ''}
              onSelect={id => { setActiveId(id); setRenaming(false) }}
              trailing={(
                <button type="button" onClick={() => addZone()} className="shrink-0 inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-sm font-semibold text-text-secondary transition-colors hover:border-brand-300 hover:text-brand-700">
                  <Plus size={14} /> 구역
                </button>
              )}
            />
            {active && (
              <ZoneToolbar
                zone={active}
                index={manual.zones.findIndex(z => z.id === active.id)}
                total={manual.zones.length}
                renaming={renaming}
                onRenameToggle={() => setRenaming(v => !v)}
                onRename={name => patchZone(active.id, { name })}
                onShift={dir => shiftZone(active, dir)}
                onColor={() => cycleColor(active)}
                onRemove={() => removeZone(active)}
              />
            )}
          </div>

          {active && view === 'list' && (
            <ZoneEditor
              key={active.id}
              zone={active}
              zones={manual.zones}
              uploadingKey={uploadingKey}
              onChange={next => patchZone(active.id, next)}
              onMoveItem={moveItemToZone}
              onUpload={(groupId, itemId, files) => handleUpload(active.id, groupId, itemId, files)}
              onRemoveImage={(groupId, itemId, url) => handleRemoveImage(active.id, groupId, itemId, url)}
              onPreview={setLightbox}
              markerIndex={markerIndex}
              onShowMarker={showMarker}
            />
          )}
          {active && view === 'space' && (
            <SpaceView
              manual={manual}
              statuses={statuses}
              latest={latest}
              activeZoneId={active.id}
              onSelectZone={id => { setActiveId(id); setRenaming(false) }}
              onGoToItem={id => { setActiveId(id); setView('list') }}
              focusMarker={focusMarker}
              edit={spaceEdit}
            />
          )}
        </>
      )}

      {manual.zones.length > 0 && (
        <SaveBar dirty={dirty} saving={saving} savedAt={savedAt} flash={flash} onSave={() => void save()} view={view} onView={setView} sticky={false} />
      )}

      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}

/** 준비 단계 — 자료함 → 도면 분석 → 평면 그리기 → AI 초안. 구역을 "만드는" 도구를 한곳에 모은다 */
function SetupPanels({ customerId, manual, assetEdit, onPlans, onFloorPlans, onCreateZone, onDraft }: {
  customerId: string
  manual: CareManualV2
  assetEdit: React.ComponentProps<typeof SpaceAssetsPanel>['edit']
  onPlans: React.ComponentProps<typeof FloorPlanAnalyzePanel>['onApply']
  onFloorPlans: (plans: NonNullable<CareManualV2['floor_plans']>) => void
  onCreateZone: (name: string, floor: number) => string
  onDraft: (zones: CareManualZoneV2[]) => void
}) {
  const step = (n: number, title: string, desc: string) => (
    <div className="flex items-start gap-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{n}</span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-text-primary">{title}</p>
        <p className="text-xs text-text-secondary break-keep">{desc}</p>
      </div>
    </div>
  )
  return (
    <div className="flex flex-col gap-4">
      {step(1, '자료 올리기', '도면·건축물대장·참고사진을 자료함에 넣습니다. 없으면 손그림 사진도 됩니다.')}
      <SpaceAssetsPanel assets={manual.assets ?? []} zones={manual.zones} edit={assetEdit} />
      {step(2, '도면으로 구역 만들기', '도면을 AI 가 읽거나, 직접 평면을 그려 방마다 구역을 만듭니다. 이 단계가 구역 탭을 채웁니다.')}
      <FloorPlanAnalyzePanel customerId={customerId} assets={manual.assets ?? []} zones={manual.zones} existingPlans={manual.floor_plans ?? []} onApply={onPlans} />
      <FloorPlanEditor plans={manual.floor_plans ?? []} zones={manual.zones} assets={manual.assets ?? []} onChange={onFloorPlans} onCreateZone={onCreateZone} />
      {step(3, '품목 초안 받기 (선택)', '자료를 바탕으로 구역별 작업 묶음·품목 초안을 AI 가 적어 줍니다. 추가하면 작업 목록으로 이동합니다.')}
      <AiDraftPanel customerId={customerId} assets={manual.assets ?? []} existingZoneCount={manual.zones.length} onApply={onDraft} />
    </div>
  )
}

/** 구조 안내 — 세 뷰가 어떻게 이어지는지 한 줄 + 펼치면 설명 */
function StructureGuide({ view }: { view: EditorView }) {
  const [open, setOpen] = useState(false)
  const step = (label: string, active: boolean) => (
    <span className={`rounded-md px-1.5 py-0.5 ${active ? 'bg-brand-50 font-bold text-brand-700' : 'text-text-secondary'}`}>{label}</span>
  )
  const tail = view === 'setup'
    ? <>{step('자료', true)} › {step('도면(층)', true)} › {step('구역 만들기', true)}</>
    : view === 'list'
      ? <>{step('구역', true)} › {step('작업 묶음', true)} › {step('품목', true)}</>
      : <>{step('층', true)} › {step('구역', true)} › {step('구역 사진', true)} › {step('표시', true)}</>
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-sunken/60 px-3 py-2 text-xs">
      <button type="button" onClick={() => setOpen(v => !v)} className="flex w-full flex-wrap items-center gap-1 text-left">
        <span className="mr-1 font-semibold text-text-tertiary">{view === 'setup' ? '순서' : '구조'}</span>
        {step('건물', false)} › {tail}
        <span className="ml-auto text-text-tertiary">{open ? '접기' : '설명'}</span>
      </button>
      {open && (
        <div className="mt-2 grid gap-1.5 text-text-secondary sm:grid-cols-2">
          <p><b className="text-text-primary">① 준비</b> — 자료 › 도면(층) › 구역 만들기. 도면이나 손그림으로 구역 탭을 만드는 곳. 건너뛰고 손으로 구역을 만들어도 됩니다.</p>
          <p><b className="text-text-primary">② 공간 보기</b> — 층 › 구역 › 구역 사진 › 표시. 구역마다 사진을 올리고 어디를 청소하는지 표시하는 곳.</p>
          <p><b className="text-text-primary">③ 작업 목록</b> — 구역 › 작업 묶음 › 품목. 표시한 자리를 무엇을 어떻게 청소하는지 글로 적는 곳.</p>
          <p>• <b>구역</b>은 세 뷰의 공통 축입니다. 탭 하나 = 구역 하나 = 도면의 방 하나.</p>
          <p>• <b>표시</b>는 사진 위 점·영역이고 품목 하나를 가리킵니다. 작업 목록의 &ldquo;표시 n&rdquo; 칩과 서로 오갑니다.</p>
          <p>• <b>층</b>은 도면 1장. 3D 에서 층별로 쌓이고, 구역마다 몇 층인지 적습니다.</p>
        </div>
      )}
    </div>
  )
}

// ─── 조각들 ─────────────────────────────────────────────────────────
function SaveBar({ dirty, saving, savedAt, flash, onSave, view, onView, sticky = true }: {
  dirty: boolean; saving: boolean; savedAt: string | null; flash: boolean; onSave: () => void; view: EditorView; onView: (v: EditorView) => void
  /** 맨 아래에 한 번 더 둘 때는 고정하지 않는다 */
  sticky?: boolean
}) {
  const seg = (v: EditorView, icon: React.ReactNode, label: string) => (
    <button type="button" onClick={() => onView(v)} className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-md px-3.5 text-sm font-bold transition-all ${view === v ? 'bg-surface text-text-primary shadow-segment' : 'text-text-secondary hover:text-text-primary'}`}>
      {icon} {label}
    </button>
  )
  return (
    <div className={`${sticky ? 'sticky top-2 z-20 backdrop-blur' : ''} flex items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface/95 px-3 py-2 shadow-soft sm:px-4`}>
      <div className="flex min-w-0 items-center gap-3">
        <div className="inline-flex shrink-0 rounded-lg bg-surface-sunken p-0.5">
          {seg('setup', <FolderOpen size={15} />, '준비')}
          {seg('space', <Box size={15} />, '공간 보기')}
          {seg('list', <ListChecks size={15} />, '작업 목록')}
        </div>
        <div className="hidden items-center gap-2 text-xs text-text-secondary sm:flex">
          <span className={`h-2 w-2 rounded-full ${dirty ? 'bg-amber-400' : 'bg-emerald-400'}`} />
          {dirty ? '저장 안 됨' : savedAt ? `${savedAt} 저장됨` : '변경 없음'}
          <span className="text-text-tertiary">· Ctrl+S</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onSave}
        disabled={saving || !dirty}
        className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${flash ? styles.savedFlash : ''} bg-brand-600 hover:bg-brand-700`}
      >
        {saving ? <Loader2 size={15} className="animate-spin" /> : flash ? <Check size={15} /> : <Save size={15} />}
        {saving ? '저장 중' : '저장'}
      </button>
    </div>
  )
}

function ZoneToolbar({ zone, index, total, renaming, onRenameToggle, onRename, onShift, onColor, onRemove }: {
  zone: CareManualZoneV2; index: number; total: number; renaming: boolean
  onRenameToggle: () => void; onRename: (name: string) => void; onShift: (dir: -1 | 1) => void; onColor: () => void; onRemove: () => void
}) {
  const t = ZONE_THEME[zone.color]
  const btn = 'rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-surface-sunken hover:text-text-primary disabled:opacity-30'
  return (
    <div className="mt-2 flex items-center gap-1 border-t border-border-subtle pt-2">
      {renaming ? (
        <input
          autoFocus
          value={zone.name}
          onChange={e => onRename(e.target.value)}
          onBlur={onRenameToggle}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') onRenameToggle() }}
          placeholder="구역 이름 (예: 주방)"
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2.5 py-1 text-sm font-semibold text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
      ) : (
        <button type="button" onClick={onRenameToggle} className="inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1 text-left text-sm font-semibold text-text-primary hover:bg-surface-sunken">
          <span className="truncate">{zone.name || '이름 없는 구역'}</span>
          <Pencil size={12} className="shrink-0 text-text-tertiary" />
        </button>
      )}
      <button type="button" onClick={onColor} className={btn} title={`색 바꾸기 (지금: ${t.label})`}><Palette size={15} /></button>
      <button type="button" onClick={() => onShift(-1)} disabled={index === 0} className={btn} title="왼쪽으로"><ChevronLeft size={15} /></button>
      <button type="button" onClick={() => onShift(1)} disabled={index === total - 1} className={btn} title="오른쪽으로"><ChevronRight size={15} /></button>
      <button type="button" onClick={onRemove} className="rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-rose-50 hover:text-rose-600" title="구역 삭제"><Trash2 size={15} /></button>
    </div>
  )
}

function EmptyStart({ onStarter, onBlank, onSetup, inSetup }: { onStarter: () => void; onBlank: () => void; onSetup: () => void; inSetup: boolean }) {
  return (
    <div className={`${styles.reveal} flex flex-col items-center gap-4 rounded-2xl border border-border-subtle bg-gradient-to-b from-sky-50 to-surface px-6 py-10 text-center shadow-soft`}>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-sky-600"><Sparkles size={22} /></span>
      <div>
        <p className="text-base font-bold text-text-primary">{inSetup ? '도면 없이 바로 시작하려면' : '아직 구역이 없습니다'}</p>
        <p className="mt-1 text-sm text-text-secondary break-keep">
          {inSetup
            ? '위에서 도면을 올려 구역을 만드는 대신, 손으로 구역 탭을 만들어 시작할 수도 있습니다.'
            : '구역은 스프레드시트의 시트처럼 탭으로 나뉩니다. 도면이 있으면 준비 단계에서 자동으로 만들고, 없으면 손으로 만듭니다.'}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {!inSetup && (
          <button type="button" onClick={onSetup} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"><FolderOpen size={15} /> 준비 단계로 (도면·자료로 만들기)</button>
        )}
        <button type="button" onClick={onStarter} className={`rounded-lg px-4 py-2 text-sm font-semibold ${inSetup ? 'bg-brand-600 text-white hover:bg-brand-700' : 'border border-border text-text-secondary hover:bg-surface-sunken'}`}>주방 · 홀 · 화장실로 시작</button>
        <button type="button" onClick={onBlank} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-secondary hover:bg-surface-sunken">빈 구역 하나 만들기</button>
      </div>
    </div>
  )
}
