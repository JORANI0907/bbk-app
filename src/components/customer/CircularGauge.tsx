'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
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
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null)
  const [mounted, setMounted] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { setMounted(true) }, [])

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
    function onScroll() { setOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onEscape)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onEscape)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  const hasTooltip = !!description

  function handleClick() {
    if (!hasTooltip) return
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setTooltipPos({
        top: rect.bottom + 8,
        left: rect.left + rect.width / 2,
      })
    }
    setOpen((o) => !o)
  }

  const tooltip = open && description && tooltipPos && mounted
    ? createPortal(
        <div
          role="tooltip"
          style={{ position: 'fixed', top: tooltipPos.top, left: tooltipPos.left, transform: 'translateX(-50%)', zIndex: 9999 }}
          className="w-44 max-w-[80vw] bg-gray-900 text-white text-[10px] font-medium leading-relaxed rounded-xl px-3 py-2 shadow-lg break-keep pointer-events-none"
        >
          <span
            className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-gray-900"
            aria-hidden="true"
          />
          <span className="relative">{description}</span>
        </div>,
        document.body
      )
    : null

  return (
    <div ref={wrapperRef} className="relative flex flex-col items-center gap-1.5">
      <button
        ref={btnRef}
        type="button"
        disabled={!hasTooltip}
        onClick={handleClick}
        className={`flex flex-col items-center gap-1.5 ${hasTooltip ? 'cursor-pointer focus:outline-none' : 'cursor-default'}`}
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
      {tooltip}
    </div>
  )
}
