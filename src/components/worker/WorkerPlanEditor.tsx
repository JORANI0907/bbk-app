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

// 'HH:MM:SS' → 'HH:MM' (input[type=time] value 포맷)
function toTimeInputValue(v: string | null): string {
  if (!v) return ''
  return v.slice(0, 5)
}

// 'HH:MM' → 'HH:MM:00' (Postgres TIME 저장 포맷)
function toDbTimeValue(v: string): string | null {
  if (!v) return null
  return v.length === 5 ? `${v}:00` : v
}

export function WorkerPlanEditor({
  initialDeparture,
  initialNote,
  onSave,
  disabled = false,
}: Props) {
  const [departure, setDeparture] = useState(toTimeInputValue(initialDeparture))
  const [note, setNote] = useState(initialNote ?? '')
  const [noteOpen, setNoteOpen] = useState(!!initialNote)
  const [saveState, setSaveState] = useState<SaveState>('idle')

  const savedDeparture = useRef(toTimeInputValue(initialDeparture))
  const savedNote = useRef(initialNote ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const persist = async (nextDeparture: string, nextNote: string) => {
    setSaveState('saving')
    try {
      await onSave({
        worker_planned_departure: toDbTimeValue(nextDeparture),
        worker_plan_note: nextNote.trim() || null,
      })
      savedDeparture.current = nextDeparture
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
    const changed = departure !== savedDeparture.current || note !== savedNote.current
    if (!changed) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void persist(departure, note)
    }, 600)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departure, note, disabled])

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

      {/* 출발 시각 */}
      <label className="block">
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={departure}
            disabled={disabled}
            onChange={(e) => setDeparture(e.target.value)}
            className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-base font-semibold text-text-primary leading-normal focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 disabled:bg-surface-sunken"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          />
          {departure && (
            <button
              type="button"
              onClick={() => setDeparture('')}
              disabled={disabled}
              className="text-xs text-text-tertiary hover:text-text-secondary px-2 py-1 rounded-md hover:bg-surface-sunken transition-colors disabled:opacity-40"
            >
              지우기
            </button>
          )}
        </div>
      </label>

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
