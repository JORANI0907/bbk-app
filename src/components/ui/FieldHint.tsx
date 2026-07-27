'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Phase 22 v11: 필드 옆에 붙이는 이모지 힌트 (hover 시 말풍선 표시).
 * v11-b: 부모 overflow-hidden에 잘리지 않도록 React Portal + fixed positioning 사용.
 */

interface Props {
  text: string
  emoji?: string
  /** 툴팁 최대 폭. 기본 260px */
  maxWidth?: number
}

export function FieldHint({ text, emoji = 'ℹ️', maxWidth = 260 }: Props) {
  const anchorRef = useRef<HTMLSpanElement | null>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; placement: 'top' | 'bottom' }>({ top: 0, left: 0, placement: 'top' })
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const computePosition = () => {
    const el = anchorRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const spaceAbove = rect.top
    const placement: 'top' | 'bottom' = spaceAbove > 60 ? 'top' : 'bottom'
    const top = placement === 'top' ? rect.top - 8 : rect.bottom + 8
    setPos({ top, left: centerX, placement })
  }

  const handleEnter = () => {
    computePosition()
    setOpen(true)
  }
  const handleLeave = () => setOpen(false)

  const tooltip = open && mounted ? createPortal(
    <div
      role="tooltip"
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        transform: pos.placement === 'top'
          ? 'translate(-50%, -100%)'
          : 'translate(-50%, 0)',
        maxWidth,
        zIndex: 9999,
        pointerEvents: 'none',
      }}
      className="bg-gray-900 text-white text-[11px] leading-relaxed px-2.5 py-1.5 rounded-lg shadow-pop break-keep whitespace-normal"
    >
      {text}
      <span
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          [pos.placement === 'top' ? 'top' : 'bottom']: '100%',
          borderWidth: 4,
          borderStyle: 'solid',
          borderColor: pos.placement === 'top'
            ? '#111827 transparent transparent transparent'
            : 'transparent transparent #111827 transparent',
        }}
      />
    </div>,
    document.body,
  ) : null

  return (
    <>
      <span
        ref={anchorRef}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onFocus={handleEnter}
        onBlur={handleLeave}
        tabIndex={0}
        aria-label="필드 설명"
        className="inline-flex items-center justify-center w-4 h-4 text-[11px] cursor-help select-none opacity-60 hover:opacity-100 transition-opacity align-middle"
      >
        {emoji}
      </span>
      {tooltip}
    </>
  )
}
