'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

interface SignReadModalProps {
  open: boolean
  title: string
  subtitle?: string | null
  html: string
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
}

/** 바닥까지 왔다고 볼 여유 픽셀 */
const END_TOLERANCE = 12

/**
 * "끝까지 읽어야 확인할 수 있는" 전체 화면 읽기 창. 보험 약관 화면과 같은 방식 —
 * 스크롤이 맨 아래에 닿기 전에는 확인 버튼이 눌리지 않고, 확인을 누르면 닫히면서 호출 쪽이 체크 처리한다.
 */
export default function SignReadModal({ open, title, subtitle, html, confirmLabel, onConfirm, onClose }: SignReadModalProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [reachedEnd, setReachedEnd] = useState(false)

  const checkEnd = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - END_TOLERANCE) setReachedEnd(true)
  }, [])

  // 열릴 때마다 처음부터. 내용이 한 화면에 다 들어오면 바로 확인 가능.
  useEffect(() => {
    if (!open) return
    setReachedEnd(false)
    const el = scrollRef.current
    if (el) el.scrollTop = 0
    const t = setTimeout(checkEnd, 150)
    return () => clearTimeout(t)
  }, [open, html, checkEnd])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-surface flex flex-col" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border-subtle bg-surface">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary break-keep">{title}</p>
          {subtitle && <p className="text-xs text-text-tertiary mt-0.5 break-keep">{subtitle}</p>}
        </div>
        <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-surface-sunken text-text-secondary flex-shrink-0" aria-label="닫기">
          <X size={20} />
        </button>
      </div>

      <div ref={scrollRef} onScroll={checkEnd} className="flex-1 overflow-y-auto">
        <div className="p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
        <div className="px-4 pb-6 text-center text-xs text-text-tertiary">— 문서 끝 —</div>
      </div>

      <div className="p-4 border-t border-border-subtle bg-surface safe-area-inset-bottom">
        <button
          type="button"
          disabled={!reachedEnd}
          onClick={onConfirm}
          className="w-full h-12 rounded-xl text-sm font-semibold bg-brand-100 text-brand-800 shadow-card hover:bg-brand-200 hover:shadow-pop active:shadow-pressed active:scale-[0.99] transition-all duration-150 disabled:opacity-40 disabled:shadow-flat disabled:cursor-not-allowed"
        >
          {confirmLabel}
        </button>
        {!reachedEnd && (
          <p className="text-xs text-text-tertiary text-center mt-2">끝까지 읽으면 버튼이 활성화됩니다.</p>
        )}
      </div>
    </div>
  )
}
