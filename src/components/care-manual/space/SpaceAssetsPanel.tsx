'use client'

/**
 * 자료함 (2026-11-08) — 도면·건축물대장·참고사진·기타
 *   관리자: 종류 고르고 올리기 · 이름/구역 지정 · 삭제(저장 후 실제 삭제)
 *   직원: 읽기 전용 목록 (현장에서 도면 확인용). 고객에게는 보이지 않는다.
 *   이 자료는 Claude 가 3D 모형을 만들 때 원본으로 읽는다.
 */

import { useRef, useState } from 'react'
import { ExternalLink, FileText, FolderOpen, Loader2, Trash2, Upload } from 'lucide-react'
import type { AssetKind, CareManualZoneV2, SpaceAssetV2 } from '@/types/care-manual'
import { ASSET_KINDS } from '@/types/care-manual'

interface Props {
  assets: SpaceAssetV2[]
  zones: CareManualZoneV2[]
  /** 없으면 읽기 전용 */
  edit?: {
    uploading: boolean
    onUpload: (files: File[], kind: AssetKind) => Promise<void>
    onPatch: (assetId: string, patch: Partial<SpaceAssetV2>) => void
    onRemove: (assetId: string) => void
  }
}

const inputCls = 'rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-200'
const KIND_LABEL = Object.fromEntries(ASSET_KINDS.map(k => [k.value, k.label])) as Record<AssetKind, string>

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  return `${Math.max(1, Math.round(bytes / 1024))}KB`
}

export function SpaceAssetsPanel({ assets, zones, edit }: Props) {
  const [kind, setKind] = useState<AssetKind>('floorplan')
  const [open, setOpen] = useState(!!edit || assets.length > 0)
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <section className="rounded-2xl border border-border-subtle bg-surface p-4 shadow-soft">
      <button type="button" onClick={() => setOpen(v => !v)} className="flex w-full items-center gap-2 text-left">
        <FolderOpen size={16} className="text-text-secondary" />
        <span className="text-sm font-bold text-text-primary">자료함</span>
        <span className="text-xs text-text-tertiary">도면 · 건축물대장 · 참고사진 ({assets.length})</span>
        <span className="ml-auto text-xs text-text-tertiary">{open ? '접기' : '펼치기'}</span>
      </button>
      {!open ? null : (
        <div className="mt-3 flex flex-col gap-3">
          {edit && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-sunken p-3">
              <select value={kind} onChange={e => setKind(e.target.value as AssetKind)} className={inputCls} aria-label="자료 종류">
                {ASSET_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
              <input ref={fileRef} type="file" accept="application/pdf,image/*" multiple className="hidden" onChange={async e => {
                const files = Array.from(e.target.files ?? [])
                e.target.value = ''
                if (files.length) await edit.onUpload(files, kind)
              }} />
              <button type="button" disabled={edit.uploading} onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                {edit.uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} 올리기
              </button>
              <span className="text-xs text-text-tertiary">PDF · 사진, 25MB 이하. 고객에게는 보이지 않습니다.</span>
            </div>
          )}
          {assets.length === 0 ? (
            <p className="py-4 text-center text-sm text-text-tertiary">{edit ? '아직 올린 자료가 없습니다. 도면부터 올려주세요.' : '등록된 자료가 없습니다.'}</p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {assets.map(a => <AssetRow key={a.id} asset={a} zones={zones} edit={edit} />)}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

function AssetRow({ asset, zones, edit }: { asset: SpaceAssetV2; zones: CareManualZoneV2[]; edit?: Props['edit'] }) {
  const isImage = asset.mime.startsWith('image/')
  const zoneName = zones.find(z => z.id === asset.zone_id)?.name
  return (
    <li className="flex items-center gap-3 py-2">
      <a href={asset.url} target="_blank" rel="noreferrer" className="shrink-0 overflow-hidden rounded-lg border border-border-subtle bg-surface-sunken" title="새 창에서 열기">
        {isImage
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={asset.url} alt={asset.title} className="h-12 w-16 object-cover" loading="lazy" />
          : <span className="flex h-12 w-16 items-center justify-center text-text-secondary"><FileText size={22} /></span>}
      </a>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-semibold text-text-secondary">{KIND_LABEL[asset.kind]}</span>
          {!edit && zoneName && <span className="text-[11px] text-text-tertiary">{zoneName}</span>}
          <span className="text-[11px] text-text-tertiary">{fmtSize(asset.size)}</span>
        </div>
        {edit ? (
          <div className="mt-1 flex flex-wrap gap-1.5">
            <input value={asset.title} onChange={e => edit.onPatch(asset.id, { title: e.target.value })} placeholder="자료 이름 (예: 5층 평면도)" className={`${inputCls} min-w-0 flex-1`} />
            <select value={asset.zone_id ?? ''} onChange={e => edit.onPatch(asset.id, { zone_id: e.target.value || undefined })} className={`${inputCls} w-32`} aria-label="관련 구역">
              <option value="">구역 전체</option>
              {zones.map(z => <option key={z.id} value={z.id}>{z.name || '이름 없는 구역'}</option>)}
            </select>
          </div>
        ) : (
          <p className="mt-0.5 truncate text-sm font-medium text-text-primary">{asset.title || '이름 없는 자료'}</p>
        )}
      </div>
      <a href={asset.url} target="_blank" rel="noreferrer" className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-sunken hover:text-text-primary" aria-label="열기"><ExternalLink size={15} /></a>
      {edit && (
        <button type="button" onClick={() => { if (confirm(`"${asset.title || KIND_LABEL[asset.kind]}" 자료를 삭제할까요? 저장을 누르면 파일도 지워집니다.`)) edit.onRemove(asset.id) }} className="rounded-lg p-1.5 text-text-tertiary hover:bg-rose-50 hover:text-rose-600" aria-label="삭제">
          <Trash2 size={15} />
        </button>
      )}
    </li>
  )
}
