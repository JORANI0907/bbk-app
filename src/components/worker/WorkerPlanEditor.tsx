'use client'

import { useEffect, useRef, useState } from 'react'
import { Clock, ChevronDown, ChevronUp, Check, Loader2, MessageSquarePlus } from 'lucide-react'

export interface PlanEditorPayload {
  worker_planned_departure: string | null  // 'HH:MM:SS' or null
  worker_plan_note: string | null
}

interface Props {
  initialDeparture: string | null
  initialNote: string | null
  onSave: (payload: PlanEditorPayload) => Promise<void>
  disabled?: boolean
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// 'HH:MM:SS' → { hh: '08', mm: '30' }
function parseTime(v: string | null): { hh: string; mm: string } {
  if (!v) return { hh: '', mm: '' }
  const parts = v.slice(0, 5).split(':')
  return { hh: parts[0] ?? '', mm: parts[1] ?? '' }
}

// 'HH', 'MM' → 'HH:MM:00' (Postgres TIME 저장 포맷)
function toDbTimeValue(hh: string, mm: string): string | null {
  if (!hh || !mm) return null
  return `${hh}:${mm}:00`
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTE_OPTIONS = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']

export function WorkerPlanEditor({
  initialDeparture,
  initialNote,
  onSave,
  disabled = false,
}: Props) {
  const initial = parseTime(initialDeparture)
  const [hour, setHour] = useState(initial.hh)
  const [minute, setMinute] = useState(initial.mm)
  const [note, setNote] = useState(initialNote ?? '')
  const [noteOpen, setNoteOpen] = useState(!!initialNote)
  const [saveState, setSaveState] = useState<SaveState>('idle')

  const savedHour = useRef(initial.hh)
  const savedMinute = useRef(initial.mm)
  const savedNote = useRef(initialNote ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const persist = async (nextHour: string, nextMinute: string, nextNote: string) => {
    setSaveState('saving')
    try {
      await onSave({
        worker_planned_departure: toDbTimeValue(nextHour, nextMinute),
        worker_plan_note: nextNote.trim() || null,
      })
      savedHour.current = nextHour
      savedMinute.current = nextMinute
      savedNote.current = nextNote
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 1600)
    } catch {
      setSaveState('error')
      setTimeout(() => setSaveState('idle'), 2400)
    }
  }

  // 자동 저장 (600ms debounce)
  useEffect(() => {
    if (disabled) return
    const changed =
      hour !== savedHour.current ||
      minute !== savedMinute.current ||
      note !== savedNote.current
    if (!changed) return
    // 시/분 중 하나만 선택된 부분 상태에서는 저장 안 함 (둘 다 선택 or 둘 다 해제)
    const bothOrNone = (!hour && !minute) || (hour && minute)
    if (!bothOrNone) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void persist(hour, minute, note)
    }, 600)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hour, minute, note, disabled])

  return (
    <div
      className={`rounded-2xl border p-4 transition-colors ${
        disabled
          ? 'bg-surface-sunken border-border-subtle opacity-70'
          : 'bg-brand-50/50 border-brand-100'
      }`}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center">
            <Clock size={16} className="text-brand-700" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary leading-tight">내 계획</p>
            <p className="text-xs text-text-tertiary leading-tight mt-0.5">
              출발 시각
            </p>
          </div>
        </div>
        <SaveIndicator state={saveState} />
      </div>

      {/* 출발 시각 — 24시간 시/분 select */}
      <div>
        <div className="flex items-center gap-2">
          <select
            value={hour}
            disabled={disabled}
            onChange={(e) => setHour(e.target.value)}
            className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-base font-semibold text-text-primary leading-normal focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 disabled:bg-surface-sunken"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            <option value="">시</option>
            {HOUR_OPTIONS.map((h) => (
              <option key={h} value={h}>{h}시</option>
            ))}
          </select>
          <span className="text-text-tertiary font-bold">:</span>
          <select
            value={minute}
            disabled={disabled}
            onChange={(e) => setMinute(e.target.value)}
            className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-base font-semibold text-text-primary leading-normal focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 disabled:bg-surface-sunken"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            <option value="">분</option>
            {MINUTE_OPTIONS.map((m) => (
              <option key={m} value={m}>{m}분</option>
            ))}
          </select>
          {(hour || minute) && (
            <button
              type="button"
              onClick={() => { setHour(''); setMinute('') }}
              disabled={disabled}
              className="text-xs text-text-tertiary hover:text-text-secondary px-2 py-1 rounded-md hover:bg-surface-sunken transition-colors disabled:opacity-40 shrink-0"
            >
              지우기
            </button>
          )}
        </div>
        <p className="text-[11px] text-text-tertiary mt-1.5 leading-normal">
          24시간 형식 (00시 ~ 23시) · 분은 5분 단위
        </p>
      </div>

      {/* 특이사항 */}
      <div className="mt-3 pt-3 border-t border-brand-100/70">
        {!noteOpen ? (
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            disabled={disabled}
            className="flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:text-brand-800 disabled:opacity-40 leading-normal break-keep"
          >
            <MessageSquarePlus size={13} />
            특이사항 추가 (선택)
            <ChevronDown size={13} />
          </button>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-text-secondary">특이사항</span>
              <button
                type="button"
                onClick={() => {
                  setNoteOpen(false)
                  setNote('')
                }}
                disabled={disabled}
                className="flex items-center gap-0.5 text-xs text-text-tertiary hover:text-text-secondary disabled:opacity-40"
              >
                접기 <ChevronUp size={12} />
              </button>
            </div>
            <textarea
              value={note}
              disabled={disabled}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="예: 차량 정비로 지하철 이용, 우천 시 30분 지연 예상 등"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary leading-normal placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 resize-none disabled:bg-surface-sunken"
            />
          </div>
        )}
      </div>

      {!disabled && (
        <p className="text-[11px] text-text-tertiary mt-2.5 leading-normal break-keep">
          변경시 자동 저장되고 관리자에게 보고서로 제출됩니다. 시간을 준수해주세요.
        </p>
      )}
    </div>
  )
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') {
    return <span className="text-[11px] text-text-tertiary">자동 저장</span>
  }
  if (state === 'saving') {
    return (
      <span className="flex items-center gap-1 text-[11px] text-text-secondary">
        <Loader2 size={11} className="animate-spin" /> 저장 중
      </span>
    )
  }
  if (state === 'saved') {
    return (
      <span className="flex items-center gap-1 text-[11px] text-state-success font-medium">
        <Check size={11} /> 저장됨
      </span>
    )
  }
  return (
    <span className="text-[11px] text-state-danger font-medium">저장 실패</span>
  )
}
