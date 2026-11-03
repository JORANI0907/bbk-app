'use client'

/**
 * 케어매뉴얼 편집기 (관리자)
 *   상단 저장 바 → 구역 탭(이름 변경·색·순서·삭제) → 구역 패널(ZoneEditor)
 *   저장은 수동 (Ctrl/⌘+S 도 됨). 바뀐 내용이 있으면 "저장 안 됨" 점이 켜진다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Loader2, Palette, Pencil, Plus, Save, Sparkles, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import type { CareManualV2, CareManualZoneV2, ZoneColor } from '@/types/care-manual'
import { ZONE_COLORS, countManualItems, emptyGroup, emptyZone } from '@/types/care-manual'
import { ZONE_THEME } from './zone-theme'
import { ZoneTabs, Lightbox, UpdatesNotice } from './CareManualViewer'
import { ZoneEditor } from './ZoneEditor'
import { useManualImages } from './useManualImages'
import styles from './care-manual.module.css'

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
  const manualRef = useRef(manual)
  useEffect(() => { manualRef.current = manual }, [manual])
  const { upload, remove, uploadingKey } = useManualImages(customerId)

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
      const now = new Date()
      setSavedAt(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)
      setFlash(true); setTimeout(() => setFlash(false), 900)
      if (!silent) toast.success(`저장됨 · 구역 ${current.zones.length}개 · 작업 ${countManualItems(current)}개`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }, [customerId, initial])

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
    if (!confirm(`"${z.name || '이름 없는 구역'}" 구역을 삭제할까요?${n > 0 ? ` 안의 작업 ${n}개도 함께 지워집니다.` : ''}`)) return
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

  // ─── 화면 ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      <SaveBar dirty={dirty} saving={saving} savedAt={savedAt} flash={flash} onSave={() => void save()} />

      {manual.zones.length === 0 ? (
        <EmptyStart onStarter={addStarter} onBlank={() => addZone()} />
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

          {active && (
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
            />
          )}
        </>
      )}

      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}

// ─── 조각들 ─────────────────────────────────────────────────────────
function SaveBar({ dirty, saving, savedAt, flash, onSave }: { dirty: boolean; saving: boolean; savedAt: string | null; flash: boolean; onSave: () => void }) {
  return (
    <div className="sticky top-2 z-20 flex items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface/95 px-4 py-2.5 shadow-soft backdrop-blur">
      <div className="flex items-center gap-2 text-xs text-text-secondary">
        <span className={`h-2 w-2 rounded-full ${dirty ? 'bg-amber-400' : 'bg-emerald-400'}`} />
        {dirty ? '저장 안 됨' : savedAt ? `${savedAt} 저장됨` : '변경 없음'}
        <span className="hidden text-text-tertiary sm:inline">· Ctrl+S</span>
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

function EmptyStart({ onStarter, onBlank }: { onStarter: () => void; onBlank: () => void }) {
  return (
    <div className={`${styles.reveal} flex flex-col items-center gap-4 rounded-2xl border border-border-subtle bg-gradient-to-b from-sky-50 to-surface px-6 py-12 text-center shadow-soft`}>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-sky-600"><Sparkles size={22} /></span>
      <div>
        <p className="text-base font-bold text-text-primary">첫 구역을 만들어 보세요</p>
        <p className="mt-1 text-sm text-text-secondary break-keep">구역은 스프레드시트의 시트처럼 탭으로 나뉩니다. 구역 안에 작업 묶음을 두고, 묶음 안에 작업을 적습니다.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={onStarter} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">주방 · 홀 · 화장실로 시작</button>
        <button type="button" onClick={onBlank} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-secondary hover:bg-surface-sunken">빈 구역 하나 만들기</button>
      </div>
    </div>
  )
}
