'use client'

/**
 * 품목 → 사진 위 표시 (역방향) 목록 (2026-11-08)
 *   작업 목록(관리자)과 메뉴얼 목록(고객·직원)에서 "이 품목은 어느 사진 어디에 찍혀 있나"를 보여주고,
 *   누르면 공간 보기로 넘어가 그 사진·그 표시가 선택된 채 열린다.
 */

import { Camera, MapPin, Pentagon } from 'lucide-react'
import type { MarkerRef } from '@/types/care-manual'

export function MarkerRefChip({ refs, onClick }: { refs: MarkerRef[]; onClick?: () => void }) {
  if (refs.length === 0) return null
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-0.5 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-100 hover:bg-sky-100" title="사진 위 표시">
      <MapPin size={11} /> 표시 {refs.length}
    </button>
  )
}

export function MarkerRefList({ refs, onShow, compact = false }: { refs: MarkerRef[]; onShow: (ref: MarkerRef) => void; compact?: boolean }) {
  if (refs.length === 0) return null
  return (
    <div className={`rounded-xl border border-sky-100 bg-sky-50/60 ${compact ? 'px-3 py-2' : 'px-3 py-2.5'}`}>
      <p className="flex items-center gap-1 text-xs font-bold text-sky-800"><Camera size={13} /> 사진 위 표시 ({refs.length})</p>
      <ul className="mt-1.5 space-y-1">
        {refs.map(r => (
          <li key={r.marker_id}>
            <button type="button" onClick={() => onShow(r)} className="group flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-white/80">
              {r.thumb_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={r.thumb_url} alt="" className="h-7 w-12 shrink-0 rounded object-cover" />
                : <span className="flex h-7 w-12 shrink-0 items-center justify-center rounded bg-sky-100 text-sky-500"><Camera size={13} /></span>}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-text-primary">
                  {r.pano_title}
                  <span className="ml-1 inline-flex items-center gap-0.5 text-[11px] font-normal text-text-tertiary">{r.type === 'polygon' ? <><Pentagon size={10} /> 영역</> : <><MapPin size={10} /> 점</>}</span>
                </span>
                {r.note && <span className="block truncate text-xs text-text-secondary">💬 {r.note}</span>}
              </span>
              <span className="shrink-0 text-xs font-semibold text-sky-700 group-hover:underline">사진에서 보기 →</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
