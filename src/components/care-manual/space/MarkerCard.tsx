'use client'

/**
 * 표시(마커)를 눌렀을 때 아래에 뜨는 카드 (2026-11-08)
 *   상태 칩 · 품목 이름 · 빈도 · 마지막 점검(누가·언제·메모) · 관리자 코멘트 · [메뉴얼에서 보기]
 *   편집 모드: 코멘트 수정 · 표시 삭제
 */

import { ArrowRight, Trash2, X } from 'lucide-react'
import type { FlatManualItem, PanoMarkerV2 } from '@/types/care-manual'
import type { CareCheck, ItemStatus } from '@/lib/care-manual-status'
import { fmtCheckDate } from '@/lib/care-manual-status'
import { FREQUENCY_LABEL } from '../zone-theme'
import { StatusChip } from './StatusChip'
import styles from '../care-manual.module.css'

interface Props {
  marker: PanoMarkerV2
  flat: FlatManualItem | null
  status: ItemStatus
  latest?: CareCheck
  onClose: () => void
  onGoToItem: () => void
  edit?: {
    onNote: (note: string) => void
    onRemove: () => void
  }
}

export function MarkerCard({ marker, flat, status, latest, onClose, onGoToItem, edit }: Props) {
  return (
    <div className={`${styles.reveal} rounded-2xl border border-border-subtle bg-surface p-4 shadow-soft`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={status} />
            {flat?.item.frequency && <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-medium text-text-secondary">{FREQUENCY_LABEL[flat.item.frequency]}</span>}
          </div>
          <h3 className="mt-1.5 text-base font-bold leading-snug text-text-primary break-keep">
            {flat ? flat.item.title || '이름 없는 품목' : '삭제된 품목'}
          </h3>
          {flat && <p className="text-xs text-text-tertiary">{flat.zone.name} · {flat.group.title || '작업 묶음'} · {flat.index}번</p>}
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-sunken" aria-label="닫기"><X size={16} /></button>
      </div>

      {latest ? (
        <div className={`mt-3 rounded-xl px-3 py-2 text-sm ${latest.status === 'issue' ? 'bg-state-danger-bg text-red-900' : 'bg-state-success-bg text-green-900'}`}>
          <p className="font-semibold">
            {latest.status === 'issue' ? '특이사항' : '점검 완료'} · {fmtCheckDate(latest.checked_at)}{latest.worker_name ? ` · ${latest.worker_name}` : ''}
          </p>
          {latest.memo && <p className="mt-0.5 whitespace-pre-line break-keep">{latest.memo}</p>}
        </div>
      ) : (
        <p className="mt-3 rounded-xl bg-surface-sunken px-3 py-2 text-sm text-text-secondary">아직 점검 기록이 없습니다.</p>
      )}

      {edit ? (
        <textarea
          value={marker.note ?? ''}
          onChange={e => edit.onNote(e.target.value)}
          placeholder="관리자 코멘트 (예: 창가 2대는 먼지 많아 격주 점검)"
          rows={2}
          className="mt-3 w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
      ) : marker.note ? (
        <p className="mt-3 text-sm leading-relaxed text-text-secondary break-keep">💬 {marker.note}</p>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        {flat && (
          <button type="button" onClick={onGoToItem} className="btn-toss-primary inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
            메뉴얼에서 보기 <ArrowRight size={15} />
          </button>
        )}
        {edit && (
          <button type="button" onClick={edit.onRemove} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2.5 text-sm font-semibold text-text-secondary hover:bg-rose-50 hover:text-rose-600">
            <Trash2 size={14} /> 표시 삭제
          </button>
        )}
      </div>
    </div>
  )
}
