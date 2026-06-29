'use client'

import { useState, useEffect, useRef } from 'react'
import { gaugeStrokeColor } from '@/lib/customer-indices'

interface CircularGaugeProps {
  pct: number | null
  displayTop: string
  displaySub: string
  title: string
  caption?: string
  description?: string
  size?: number
  strokeWidth?: number
  variant?: 'dark' | 'light'
}

/**
 * 원형 게이지. customer 웰컴 카드 = dark, franchise 지점 카드 = light.
 * 색상 룰은 lib/customer-indices.ts의 gaugeStrokeColor 단일 정의를 사용.
 * description이 있으면 클릭/탭 시 설명 tooltip을 보여줌. 외부 클릭 또는 ESC 키로 닫힘.
 */
export function CircularGauge({
  pct,
  displayTop,
  displaySub,
  title,
  caption,
  description,
  size = 72,
  strokeWidth = 7,
  variant = 'dark',
}: CircularGaugeProps) {
  const r = (size - strokeWidth) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - (pct ?? 0) / 100)
  const color = gaugeStrokeColor(pct)

  const trackColor = variant === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(15,23,42,0.08)'
  const topTextClass = variant === 'dark' ? 'text-white' : 'text-text-primary'
  const subTextClass = variant === 'dark' ? 'text-white/70' : 'text-text-tertiary'
  const titleClass = variant === 'dark' ? 'text-white/70' : 'text-text-secondary'
  const captionClass = variant === 'dark' ? 'text-white/45' : 'text-text-tertiary'

  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onEscape)
    }
  }, [open])

  const hasTooltip = !!description
  const wrapperClass = hasTooltip ? 'cursor-pointer focus:outline-none' : 'cursor-default'

  return (
    <div ref={wrapperRef} className="relative flex flex-col items-center gap-1.5">
      <button
        type="button"
        disabled={!hasTooltip}
        onClick={() => hasTooltip && setOpen((o) => !o)}
        className={`flex flex-col items-center gap-1.5 ${wrapperClass}`}
        aria-label={`${title} 설명 보기`}
        aria-expanded={open}
      >
        <div className="relative" style={{ width: size, height: size }}>
          <svg
            width={size}
            height={size}
            style={{ transform: 'rotate(-90deg)', display: 'block' }}
          >
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={trackColor}
              strokeWidth={strokeWidth}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={`${circ}`}
              strokeDashoffset={`${offset}`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className={`text-base font-black leading-none ${topTextClass}`}>{displayTop}</span>
            <span className={`text-[9px] leading-none mt-0.5 ${subTextClass}`}>{displaySub}</span>
          </div>
        </div>
        <p className={`text-[9px] font-semibold text-center leading-tight break-keep ${titleClass}`}>
          {title}
        </p>
      </button>
      {caption && (
        <p className={`text-[8px] text-center leading-tight break-keep ${captionClass}`}>
          {caption}
        </p>
      )}

      {open && description && (
        <div
          role="tooltip"
          className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-56 max-w-[80vw] z-30 bg-text-primary text-white text-[11px] font-medium leading-relaxed rounded-xl px-3.5 py-2.5 shadow-pop break-keep"
        >
          {/* arrow */}
          <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-text-primary" aria-hidden="true" />
          <span className="relative">{description}</span>
        </div>
      )}
    </div>
  )
}
