'use client'

/**
 * 작업 항목 하나의 펼친 편집 폼
 *   제목 · 작업 지시(자동으로 늘어나는 메모장) · 주의사항(선택) · 빈도 칩 · 사진 여러 장 · 다른 구역으로 이동
 */

import { useRef } from 'react'
import { AlertTriangle, ImagePlus, Loader2, MoveRight, X } from 'lucide-react'
import toast from 'react-hot-toast'
import type { CareManualItemV2, CareManualZoneV2, Frequency } from '@/types/care-manual'
import { FREQUENCY_OPTIONS } from '@/types/care-manual'

interface Props {
  item: CareManualItemV2
  zones: CareManualZoneV2[]
  currentZoneId: string
  uploading: boolean
  onChange: (patch: Partial<CareManualItemV2>) => void
  onUpload: (files: File[]) => Promise<void>
  onRemoveImage: (url: string) => void
  onMoveToZone: (zoneId: string) => void
  onPreview: (url: string) => void
}

const inputCls = 'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-brand-200'

function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

export function ItemEditor({ item, zones, currentZoneId, uploading, onChange, onUpload, onRemoveImage, onMoveToZone, onPreview }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const otherZones = zones.filter(z => z.id !== currentZoneId)

  const handleFiles = async (list: FileList | null) => {
    const files = Array.from(list ?? []).filter(f => f.type.startsWith('image/'))
    if (files.length === 0) return
    await onUpload(files)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="grid gap-4 px-4 pb-4 pt-1 sm:grid-cols-[1fr_200px]">
      <div className="space-y-3">
        <Field label="작업 지시" hint="줄바꿈과 '- ' 글머리표가 그대로 보입니다">
          <textarea
            value={item.instructions}
            onChange={e => { onChange({ instructions: e.target.value }); autoGrow(e.currentTarget) }}
            ref={el => { if (el) autoGrow(el) }}
            rows={3}
            placeholder={'예)\n- 후드 필터 3장 분리 후 전용 약품에 10분 담그기\n- 내부 기름받이 비우고 세척\n- 재조립 후 작동 확인'}
            className={`${inputCls} min-h-[88px] resize-none leading-relaxed`}
          />
        </Field>

        <Field label="주의사항" hint="선택 · 빨간 띠로 따로 표시됩니다">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-2.5 shrink-0 text-rose-400" />
            <textarea
              value={item.caution ?? ''}
              onChange={e => { onChange({ caution: e.target.value || undefined }); autoGrow(e.currentTarget) }}
              ref={el => { if (el) autoGrow(el) }}
              rows={1}
              placeholder="예) 전원 차단 후 작업, 스테인리스에 염소계 약품 금지"
              className={`${inputCls} resize-none`}
            />
          </div>
        </Field>

        <Field label="작업 빈도" hint="선택">
          <div className="flex flex-wrap gap-1.5">
            {FREQUENCY_OPTIONS.map(opt => {
              const on = item.frequency === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onChange({ frequency: on ? null : (opt.value as Frequency) })}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    on ? 'bg-brand-600 text-white' : 'bg-surface-sunken text-text-secondary hover:bg-border-subtle'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </Field>
      </div>

      <div className="space-y-3">
        <Field label={`사진 ${item.images.length > 0 ? `(${item.images.length})` : ''}`}>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-2">
            {item.images.map(url => (
              <div key={url} className="group relative aspect-square overflow-hidden rounded-lg border border-border-subtle">
                <button type="button" onClick={() => onPreview(url)} className="block h-full w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveImage(url)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="사진 삭제"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-text-tertiary transition-colors hover:border-brand-400 hover:text-brand-600 disabled:opacity-60"
            >
              {uploading ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
              <span className="text-[11px] font-medium">{uploading ? '올리는 중' : '추가'}</span>
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => void handleFiles(e.target.files)} />
        </Field>

        {otherZones.length > 0 && (
          <Field label="다른 구역으로 이동">
            <div className="relative">
              <MoveRight size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <select
                value=""
                onChange={e => {
                  if (!e.target.value) return
                  onMoveToZone(e.target.value)
                  toast.success('항목을 옮겼습니다. 저장을 눌러 반영하세요.')
                }}
                className={`${inputCls} appearance-none pl-8`}
              >
                <option value="">구역 선택…</option>
                {otherZones.map(z => <option key={z.id} value={z.id}>{z.name || '이름 없는 구역'}</option>)}
              </select>
            </div>
          </Field>
        )}
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-semibold text-text-secondary">{label}</span>
        {hint && <span className="text-[11px] text-text-tertiary">{hint}</span>}
      </div>
      {children}
    </div>
  )
}
