'use client'

/**
 * 맨 위로 버튼 — 스크롤을 일정 이상 내리면 오른쪽 아래에 나타난다.
 * 관리자 레이아웃은 window 가 아니라 내부 div 가 스크롤되므로, 이 컴포넌트가 놓인 위치에서
 * 가장 가까운 스크롤 컨테이너를 찾아 거기에 붙는다 (없으면 window).
 */
import { useEffect, useRef, useState } from 'react'
import { ArrowUp } from 'lucide-react'

interface ScrollToTopButtonProps {
  /** 이 픽셀 이상 내려가면 표시 (기본 320) */
  threshold?: number
  className?: string
}

/**
 * 가장 가까운 스크롤 컨테이너(overflow-y: auto|scroll)를 찾는다.
 * 내용 길이는 보지 않는다 — 편집기처럼 나중에 로딩되는 본문이 있으면 처음엔 짧아서
 * 컨테이너를 놓치고 버튼이 영영 안 보이는 문제가 있었다 (2026-11-23).
 */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null
  while (node) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll') return node
    node = node.parentElement
  }
  return null
}

export function ScrollToTopButton({ threshold = 320, className = '' }: ScrollToTopButtonProps) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const targetRef = useRef<HTMLElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const container = findScrollParent(anchorRef.current)
    targetRef.current = container
    const source: HTMLElement | Window = container ?? window
    const read = () => (container ? container.scrollTop : window.scrollY)
    const onScroll = () => setVisible(read() > threshold)
    onScroll()
    source.addEventListener('scroll', onScroll, { passive: true })
    return () => source.removeEventListener('scroll', onScroll)
  }, [threshold])

  const scrollToTop = () => {
    const container = targetRef.current
    if (container) container.scrollTo({ top: 0, behavior: 'smooth' })
    else window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <>
      <span ref={anchorRef} aria-hidden className="hidden" />
      <button
        type="button"
        onClick={scrollToTop}
        aria-label="맨 위로"
        className={
          'fixed right-4 bottom-24 md:right-8 md:bottom-8 z-30 w-11 h-11 rounded-full bg-brand-100 text-brand-700 shadow-pop ' +
          'flex items-center justify-center transition-all duration-150 ease-out-toss hover:bg-brand-200 active:scale-95 ' +
          (visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none') + ' ' + className
        }
      >
        <ArrowUp size={20} />
      </button>
    </>
  )
}
