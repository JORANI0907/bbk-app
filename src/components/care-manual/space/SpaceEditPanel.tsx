'use client'

/**
 * 공간 보기 편집 조각들 (관리자, 2026-11-08 재배치)
 *   PanoStrip   : 사진 위 한 줄 — 썸네일 선택 · [＋ 사진 올리기] · [품목 사진 가져오기] · 선택한 사진 이름/삭제. (사진 선택은 여기 한 곳뿐)
 *                 평면 사진이 기본. 2:1 비율이면 자동으로 360 으로 인식한다.
 *   MarkerTools : 사진 위 왼쪽 위에 겹쳐 뜨는 도구 — 점 / 영역 / 영역 완료 / 취소
 *   DraftForm   : 점·영역을 찍은 직후 사진 바로 아래 — 어느 품목인지 + 코멘트 + 추가
 *   MarkerList  : 사진 아래 — 이 사진의 표시 목록 (누르면 사진에서 강조, 삭제)
 *   FloorInput  : 구역 헤더 오른쪽 — 이 구역의 층
 */

import { useRef, useState } from 'react'
import { Check, Images, Loader2, MapPin, Pentagon, Plus, Trash2, X } from 'lucide-react'
import type { CareManualZoneV2, FlatManualItem, PanoMarkerV2, PanoramaV2 } from '@/types/care-manual'
import { photoKind } from '@/types/care-manual'
import type { ItemStatus } from '@/lib/care-manual-status'
import { STATUS_HEX } from '@/lib/care-manual-status'
import { FREQUENCY_LABEL } from '../zone-theme'
import type { SpaceEditHandlers } from './SpaceView'
import { zoneFloor } from './space-layout'

export type EditTool = 'none' | 'point' | 'polygon'

const inputCls = 'rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-200'

// ─── 층 입력 (구역 헤더) ────────────────────────────────────────────
export function FloorInput({ zone, onChange }: { zone: CareManualZoneV2; onChange: (floor: number) => void }) {
  return (
    <label className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-text-secondary" title="지하는 음수 (예: -1). 3D 모형에 층별로 쌓입니다">
      층
      <input type="number" value={zoneFloor(zone)} onChange={e => onChange(Number(e.target.value) || 1)} className={`${inputCls} w-16 py-1 tabular-nums`} aria-label="이 구역의 층" />
    </label>
  )
}

// ─── 사진 한 줄 ─────────────────────────────────────────────────────
export function PanoStrip({ zone, panoramas, activeId, onSelect, edit, flat }: {
  zone: CareManualZoneV2
  panoramas: PanoramaV2[]
  activeId: string | null
  onSelect: (id: string) => void
  edit: SpaceEditHandlers
  /** 품목 사진 가져오기 후보용 */
  flat: FlatManualItem[]
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const active = panoramas.find(p => p.id === activeId) ?? null
  const used = new Set(panoramas.map(p => p.image_url))
  const candidates = flat.filter(f => f.zone.id === zone.id).flatMap(f => f.item.images.filter(u => !used.has(u)).map(url => ({ item: f.item, url })))
  return (
    <div className="border-b border-border-subtle bg-surface-sunken/60 px-3 py-2">
      <div className="flex items-center gap-2 overflow-x-auto">
        {panoramas.map((p, i) => (
          <button key={p.id} type="button" onClick={() => onSelect(p.id)} className={`group relative shrink-0 overflow-hidden rounded-lg ring-2 transition-all ${p.id === activeId ? 'ring-brand-600' : 'ring-transparent opacity-75 hover:opacity-100'}`} title={p.title || `사진 ${i + 1}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.thumb_url ?? p.image_url} alt={p.title} className="h-12 w-20 object-cover" />
            {photoKind(p) === '360' && <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[9px] font-bold text-white">360</span>}
            <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 text-[10px] font-medium text-white">{p.title || `사진 ${i + 1}`}{p.markers.length ? ` · ${p.markers.length}` : ''}</span>
          </button>
        ))}
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={async e => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (files.length) await edit.onAddPanorama(zone.id, files)
        }} />
        <button type="button" disabled={edit.uploading} onClick={() => fileRef.current?.click()} className="flex h-12 shrink-0 items-center gap-1 rounded-lg border-2 border-dashed border-brand-300 px-3 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50" title="휴대폰 사진 그대로. 2:1 비율(360 카메라)이면 자동으로 360 으로 인식">
          {edit.uploading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} 사진 올리기
        </button>
        {candidates.length > 0 && (
          <button type="button" onClick={() => setImporting(v => !v)} className={`flex h-12 shrink-0 items-center gap-1 rounded-lg border px-3 text-xs font-semibold ${importing ? 'border-brand-600 bg-brand-600 text-white' : 'border-border bg-surface text-text-secondary hover:border-brand-300'}`} title="이 구역 품목에 이미 올라간 사진을 구역 사진으로 가져옵니다">
            <Images size={14} /> 품목 사진 가져오기 ({candidates.length})
          </button>
        )}
      </div>
      {importing && candidates.length > 0 && (
        <div className="mt-2 rounded-lg border border-brand-200 bg-surface p-2">
          <p className="mb-1.5 text-[11px] text-text-tertiary">누르면 구역 사진으로 추가되고 그 품목 표시를 바로 찍을 수 있습니다. 사진은 복사되지 않고 같은 파일을 씁니다.</p>
          <div className="flex gap-2 overflow-x-auto">
            {candidates.map(c => (
              <button key={c.url} type="button" onClick={() => { edit.onImportItemPhoto(zone.id, c.item.id, c.url); setImporting(false) }} className="group relative shrink-0 overflow-hidden rounded-lg ring-2 ring-transparent hover:ring-brand-500" title={c.item.title}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.url} alt={c.item.title} className="h-14 w-20 object-cover" />
                <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 text-[10px] font-medium text-white">{c.item.title || '이름 없는 품목'}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {active && (
        <div className="mt-2 flex items-center gap-2">
          <span className="shrink-0 text-xs text-text-tertiary">선택한 사진</span>
          <input value={active.title} onChange={e => edit.onRenamePanorama(zone.id, active.id, e.target.value)} placeholder="사진 이름 (예: 입구 쪽, 후드 내부)" className={`${inputCls} min-w-0 flex-1 py-1`} />
          <button type="button" onClick={() => { if (confirm('이 사진과 위의 표시를 모두 삭제할까요? 저장을 누르면 파일도 지워집니다.')) edit.onRemovePanorama(zone.id, active.id) }} className="rounded-lg p-1.5 text-text-tertiary hover:bg-rose-50 hover:text-rose-600" aria-label="사진 삭제" title="사진 삭제">
            <Trash2 size={15} />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── 사진 위 도구 ───────────────────────────────────────────────────
export function MarkerTools({ tool, onTool, pendingCount, onFinishPolygon, onCancel }: {
  tool: EditTool
  onTool: (t: EditTool) => void
  pendingCount: number
  onFinishPolygon: () => void
  onCancel: () => void
}) {
  const btn = (active: boolean) => `inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold shadow-pop transition-colors ${active ? 'bg-brand-600 text-white' : 'bg-surface/95 text-text-primary hover:bg-surface'}`
  return (
    <div className="pointer-events-auto absolute left-2 top-2 z-10 flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={() => onTool(tool === 'point' ? 'none' : 'point')} className={btn(tool === 'point')} title="설비 하나에 점 찍기"><MapPin size={13} /> 점</button>
      <button type="button" onClick={() => onTool(tool === 'polygon' ? 'none' : 'polygon')} className={btn(tool === 'polygon')} title="바닥·벽면처럼 넓은 곳을 꼭짓점으로 둘러 그리기"><Pentagon size={13} /> 영역</button>
      {tool === 'polygon' && (
        <>
          <button type="button" disabled={pendingCount < 3} onClick={onFinishPolygon} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-pop disabled:opacity-40">
            <Check size={13} /> 영역 완료 {pendingCount}/3+
          </button>
          <button type="button" onClick={onCancel} className="rounded-lg bg-surface/95 p-1.5 text-text-secondary shadow-pop" aria-label="취소"><X size={13} /></button>
        </>
      )}
      {tool !== 'none' && (
        <span className="rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white">
          {tool === 'point' ? '설비 위를 한 번 누르세요' : '꼭짓점을 차례로 누르고 영역 완료'}
        </span>
      )}
    </div>
  )
}

// ─── 찍은 직후: 품목 고르기 ────────────────────────────────────────
const NEW_ITEM = '__new__'

/**
 * 제목이 비어 있는 품목은 목록에서 뺀다 (작업 묶음을 만들면 빈 품목이 하나 생기는데 그게 "제목 없는 작업"으로 보이던 문제).
 * 사진을 보다 설비를 발견하면 그 자리에서 [＋ 새 품목 만들기]로 품목을 만들고 바로 연결할 수 있다.
 */
export function DraftForm({ zone, zones, flat, onCommit, onCreateItem, onCancel }: {
  zone: CareManualZoneV2
  zones: CareManualZoneV2[]
  flat: FlatManualItem[]
  onCommit: (itemId: string, note: string) => void
  /** 새 품목을 이 구역에 만들고 id 를 돌려준다 */
  onCreateItem: (zoneId: string, title: string) => string
  onCancel: () => void
}) {
  const titled = flat.filter(f => f.item.title.trim())
  const zoneItems = titled.filter(f => f.zone.id === zone.id)
  const otherItems = titled.filter(f => f.zone.id !== zone.id)
  const [itemId, setItemId] = useState(zoneItems[0]?.item.id ?? NEW_ITEM)
  const [newTitle, setNewTitle] = useState('')
  const [note, setNote] = useState('')
  const isNew = itemId === NEW_ITEM
  const canSubmit = isNew ? newTitle.trim().length > 0 : !!itemId
  const submit = () => {
    const id = isNew ? onCreateItem(zone.id, newTitle.trim()) : itemId
    onCommit(id, note)
  }
  const group = (items: FlatManualItem[], label: string) => items.length > 0 && (
    <optgroup label={label}>
      {items.map(f => <option key={f.item.id} value={f.item.id}>{f.index}. {f.item.title}{f.group.title ? ` (${f.group.title})` : ''}</option>)}
    </optgroup>
  )
  return (
    <div className="border-t-2 border-brand-300 bg-brand-50/60 px-3 py-3">
      <p className="text-xs font-bold text-brand-700">찍은 표시는 어느 품목인가요?</p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        <select value={itemId} onChange={e => setItemId(e.target.value)} className={`${inputCls} min-w-[12rem] flex-1`} aria-label="품목 선택">
          <option value={NEW_ITEM}>＋ 새 품목 만들기 (이 구역에 추가)</option>
          {group(zoneItems, '이 구역 품목')}
          {zones.filter(z => otherItems.some(f => f.zone.id === z.id)).map(z => group(otherItems.filter(f => f.zone.id === z.id), `${z.name} 구역`))}
        </select>
        {isNew && (
          <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && canSubmit) submit() }} placeholder="새 품목 제목 (예: 테이블·의자 닦기)" className={`${inputCls} min-w-[12rem] flex-1`} />
        )}
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="한 줄 코멘트 (선택)" className={`${inputCls} min-w-[12rem] flex-1`} />
        <button type="button" disabled={!canSubmit} onClick={submit} className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40"><Check size={14} /> 표시 추가</button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text-secondary hover:bg-surface">취소</button>
      </div>
      {zoneItems.length === 0 && !isNew && <p className="mt-1.5 text-[11px] text-text-tertiary">이 구역에 제목이 있는 품목이 없습니다. 새 품목을 만들거나 작업 목록 탭에서 품목 제목을 적어주세요.</p>}
      {isNew && <p className="mt-1.5 text-[11px] text-text-tertiary">새 품목은 이 구역의 첫 작업 묶음에 들어갑니다. 설명·빈도는 작업 목록 탭에서 채워주세요.</p>}
    </div>
  )
}

// ─── 사진 아래: 표시 목록 ──────────────────────────────────────────
export function MarkerList({ pano, flat, statuses, selectedMarkerId, onSelect, onRemove }: {
  pano: PanoramaV2
  flat: FlatManualItem[]
  statuses: Record<string, ItemStatus>
  selectedMarkerId: string | null
  onSelect: (markerId: string) => void
  onRemove: (markerId: string) => void
}) {
  if (pano.markers.length === 0) {
    return <p className="border-t border-border-subtle px-4 py-3 text-xs text-text-tertiary">아직 표시가 없습니다. 사진 위 [점] 또는 [영역]을 누르고 설비 위를 눌러보세요.</p>
  }
  return (
    <div className="border-t border-border-subtle">
      <p className="px-4 pt-2 text-xs font-bold text-text-secondary">이 사진의 표시 ({pano.markers.length})</p>
      <ul className="divide-y divide-border-subtle">
        {pano.markers.map(m => {
          const f = flat.find(x => x.item.id === m.item_id)
          const status = statuses[m.item_id] ?? 'none'
          const selected = m.id === selectedMarkerId
          return (
            <li key={m.id} className={`flex items-center gap-2 px-3 py-1.5 ${selected ? 'bg-brand-50' : ''}`}>
              <button type="button" onClick={() => onSelect(m.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: STATUS_HEX[status] }}>{f?.index ?? '?'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text-primary">{f?.item.title || '삭제된 품목'}<span className="ml-1 text-[11px] font-normal text-text-tertiary">{m.type === 'polygon' ? '영역' : '점'}{f?.item.frequency ? ` · ${FREQUENCY_LABEL[f.item.frequency]}` : ''}</span></span>
                  {m.note && <span className="block truncate text-xs text-text-secondary">💬 {m.note}</span>}
                </span>
              </button>
              <button type="button" onClick={() => { if (confirm('이 표시를 삭제할까요?')) onRemove(m.id) }} className="rounded-lg p-1.5 text-text-tertiary hover:bg-rose-50 hover:text-rose-600" aria-label="표시 삭제"><Trash2 size={14} /></button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** 표시 하나를 "선택 표시"로 바꿀 때 쓰는 공용 타입 (SpaceView 에서 import) */
export type DraftMarker = Omit<PanoMarkerV2, 'id' | 'item_id'>
