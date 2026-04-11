'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

interface PopupNotice {
  id: string
  title: string
  content: string
  type: 'notice' | 'event'
  priority: 'normal' | 'important' | 'urgent'
  image_url: string | null
  event_date: string | null
  author_name: string | null
}

const PRIORITY_BADGE: Record<string, string> = {
  urgent: 'bg-red-500 text-white',
  important: 'bg-orange-500 text-white',
  normal: 'bg-gray-200 text-gray-600',
}

const PRIORITY_LABEL: Record<string, string> = {
  urgent: '긴급', important: '중요', normal: '일반',
}

const TYPE_ICON: Record<string, string> = { notice: '📢', event: '🎉' }

export function PopupNoticeController() {
  const pathname = usePathname()
  const [queue, setQueue] = useState<PopupNotice[]>([])
  const [current, setCurrent] = useState<PopupNotice | null>(null)
  // 이미 표시된 공지 ID 추적 (세션 내 중복 표시 방지 — 탭 변경마다 재표시)
  const shownInTab = useRef<Set<string>>(new Set())
  // 최초 로드는 건너뜀 (홈 화면 진입 시 바로 팝업 안 뜨도록)
  const isFirstLoad = useRef(true)

  // 탭(pathname) 변경 시 팝업 공지 fetch
  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false
      return
    }
    // 탭 이동 시 shownInTab 초기화 (탭마다 팝업 다시 표시)
    shownInTab.current = new Set()

    fetch('/api/admin/notices')
      .then(r => r.json())
      .then(d => {
        const popupNotices: PopupNotice[] = (d.notices ?? []).filter(
          (n: { popup?: boolean }) => n.popup === true
        )
        if (popupNotices.length > 0) {
          setQueue(popupNotices)
          setCurrent(popupNotices[0])
        }
      })
      .catch(() => {})
  }, [pathname])

  const handleClose = () => {
    if (!current) return
    shownInTab.current.add(current.id)
    const remaining = queue.filter(n => !shownInTab.current.has(n.id))
    if (remaining.length > 0) {
      setCurrent(remaining[0])
      setQueue(remaining)
    } else {
      setCurrent(null)
      setQueue([])
    }
  }

  if (!current) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* 사진이 있으면 먼저 */}
        {current.image_url && (
          <img src={current.image_url} alt={current.title} className="w-full max-h-56 object-cover" />
        )}

        <div className="p-5">
          {/* 뱃지 */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">{TYPE_ICON[current.type] ?? '📢'}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PRIORITY_BADGE[current.priority]}`}>
              {PRIORITY_LABEL[current.priority]}
            </span>
            {queue.length > 1 && (
              <span className="text-xs text-gray-400 ml-auto">
                {queue.indexOf(current) + 1} / {queue.length}
              </span>
            )}
          </div>

          {/* 제목 */}
          <h2 className="text-base font-bold text-gray-900 mb-2">{current.title}</h2>

          {/* 내용 */}
          <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
            {current.content}
          </p>

          {current.event_date && (
            <p className="mt-2 text-xs text-purple-600 font-medium">
              📅 행사일: {new Date(current.event_date).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
            </p>
          )}
        </div>

        <div className="px-5 pb-5">
          <button
            onClick={handleClose}
            className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            {queue.filter(n => !shownInTab.current.has(n.id)).length > 1
              ? '다음 공지 보기'
              : '확인'}
          </button>
        </div>
      </div>
    </div>
  )
}
