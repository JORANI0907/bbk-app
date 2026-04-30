'use client'

import { ReactNode, useEffect, useRef, useCallback } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string | ReactNode
  description?: string | ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  /**
   * 닫기 버튼 표시 여부 (기본 true)
   */
  showCloseButton?: boolean
  /**
   * 오버레이 클릭으로 닫기 비활성화 (기본 false)
   */
  disableOverlayClose?: boolean
  /**
   * ESC 키로 닫기 비활성화 (기본 false)
   */
  disableEscClose?: boolean
  footer?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * 표준 모달 다이얼로그.
 * - 외부 라이브러리 의존 없이 React + Tailwind만으로 구현 (가벼움 우선)
 * - body 스크롤 잠금, ESC 닫기, 오버레이 클릭 닫기, 포커스 스타일
 *
 * 접근성 한계: focus trap은 단순 구현. 매우 복잡한 폼이 들어가면
 * `react-aria` 또는 `radix-ui/react-dialog`로 교체 고려.
 *
 * 사용:
 *   <Modal open={open} onClose={() => setOpen(false)} title="확인">
 *     <p>정말 삭제하시겠습니까?</p>
 *   </Modal>
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  showCloseButton = true,
  disableOverlayClose = false,
  disableEscClose = false,
  footer,
  children,
  className = '',
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousActiveElement = useRef<Element | null>(null)

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  // ESC 키 처리 + body 스크롤 잠금
  useEffect(() => {
    if (!open) return

    previousActiveElement.current = document.activeElement
    document.body.style.overflow = 'hidden'

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !disableEscClose) handleClose()
    }
    document.addEventListener('keydown', handleKey)

    // 다이얼로그에 포커스
    requestAnimationFrame(() => {
      dialogRef.current?.focus()
    })

    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', handleKey)
      // 이전 포커스 복원
      if (previousActiveElement.current instanceof HTMLElement) {
        previousActiveElement.current.focus()
      }
    }
  }, [open, disableEscClose, handleClose])

  if (!open) return null

  const sizeStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
    full: 'max-w-[95vw] h-[95vh]',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
      aria-describedby={description ? 'modal-description' : undefined}
    >
      {/* 오버레이 */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={() => {
          if (!disableOverlayClose) handleClose()
        }}
        aria-hidden="true"
      />

      {/* 다이얼로그 */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`
          relative w-full ${sizeStyles[size]}
          bg-surface rounded-2xl shadow-modal
          flex flex-col max-h-[90vh] outline-none
          ${className}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || showCloseButton) && (
          <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-2">
            <div className="min-w-0 flex-1">
              {title && (
                <h2
                  id="modal-title"
                  className="text-lg font-bold text-text-primary leading-snug"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p
                  id="modal-description"
                  className="text-sm text-text-secondary mt-1.5 leading-normal"
                >
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <button
                type="button"
                onClick={handleClose}
                aria-label="닫기"
                className="shrink-0 -mr-2 -mt-2 w-8 h-8 inline-flex items-center justify-center rounded-md text-text-tertiary hover:text-text-primary hover:bg-surface-sunken transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>

        {footer && (
          <div className="px-6 py-4 border-t border-border-subtle flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
