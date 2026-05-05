'use client'

import { useState, useEffect } from 'react'

interface Props {
  value: string       // "HH:MM" or ""
  onChange: (val: string) => void
  placeholder?: string
  className?: string
}

const HOURS   = Array.from({ length: 24 }, (_, i) => i)          // 0~23
const MINUTES = [0, 10, 20, 30, 40, 50]

export function TimePicker24h({ value, onChange, placeholder = '시간 선택', className = '' }: Props) {
  const [open, setOpen]           = useState(false)
  const [selHour, setSelHour]     = useState<number | null>(null)
  const [selMin,  setSelMin]      = useState<number | null>(null)

  // 모달 열 때 기존 값이 있으면 파싱, 없으면 null (현재 시간 자동 설정 없음)
  const handleOpen = () => {
    if (value) {
      const [h, m] = value.split(':').map(Number)
      if (!isNaN(h) && !isNaN(m)) {
        setSelHour(h)
        setSelMin(Math.round(m / 10) * 10 % 60)
        setOpen(true)
        return
      }
    }
    setSelHour(null)
    setSelMin(null)
    setOpen(true)
  }

  const handleConfirm = () => {
    if (selHour !== null && selMin !== null) {
      const h = String(selHour).padStart(2, '0')
      const m = String(selMin).padStart(2, '0')
      onChange(`${h}:${m}`)
    }
    setOpen(false)
  }

  const handleClear = () => {
    onChange('')
    setSelHour(null)
    setSelMin(null)
    setOpen(false)
  }

  const displayLabel = value
    ? (() => {
        const [h, m] = value.split(':').map(Number)
        if (isNaN(h)) return placeholder
        return `${String(h).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`
      })()
    : placeholder

  const previewStr = selHour !== null && selMin !== null
    ? `${String(selHour).padStart(2, '0')}:${String(selMin).padStart(2, '0')}`
    : null

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className={`border border-border rounded-lg px-3 py-1.5 text-xs text-left focus:outline-none focus:ring-2 focus:ring-blue-400 ${
          value ? 'text-text-primary' : 'text-text-tertiary'
        } ${className}`}
      >
        {displayLabel}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-surface w-full max-w-sm rounded-t-2xl p-5 pb-8 shadow-modal"
            onClick={e => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-text-primary">시간 설정</h3>
              {previewStr && (
                <span className="text-xl font-black text-brand-600">{previewStr}</span>
              )}
            </div>

            <div className="flex gap-4">
              {/* 시 (0~23) */}
              <div className="flex-1">
                <p className="text-xs font-semibold text-text-tertiary mb-2 text-center">시 (24시간)</p>
                <div className="grid grid-cols-4 gap-1">
                  {HOURS.map(h => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setSelHour(h)}
                      className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
                        selHour === h
                          ? 'bg-brand-600 text-white'
                          : 'bg-surface-sunken text-text-primary hover:bg-brand-50'
                      }`}
                    >
                      {String(h).padStart(2, '0')}
                    </button>
                  ))}
                </div>
              </div>

              {/* 분 (0, 10, 20, 30, 40, 50) */}
              <div className="w-16">
                <p className="text-xs font-semibold text-text-tertiary mb-2 text-center">분</p>
                <div className="flex flex-col gap-1">
                  {MINUTES.map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSelMin(m)}
                      className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
                        selMin === m
                          ? 'bg-brand-600 text-white'
                          : 'bg-surface-sunken text-text-primary hover:bg-brand-50'
                      }`}
                    >
                      {String(m).padStart(2, '0')}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 액션 버튼 */}
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={handleClear}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-surface-sunken text-text-secondary hover:bg-border transition-colors"
              >
                초기화
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-surface-sunken text-text-secondary hover:bg-border transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={selHour === null || selMin === null}
                className="flex-[2] py-2.5 rounded-xl text-sm font-bold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
