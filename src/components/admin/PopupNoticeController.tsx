'use client'

import { useState, useEffect } from 'react'
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

const SESSION_KEY = 'bbk_popup_dismissed'

function getDismissedIds(): string[] {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function addDismissedId(id: string): void {
  try {
    const current = getDismissedIds()
    if (!current.includes(id)) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify([...current, id]))
    }
  } catch {
    // sessionStorage 접근 불가 시 무시
  }
}

export function PopupNoticeController() {
  const pathname = usePathname()
  const [queue, setQueue] = useState<PopupNotice[]>([])
  const [current, setCurrent] = useState<PopupNotice | null>(null)
  const [dontShow, setDontShow] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  // 탭(pathname) 변경 시 팝업 공지 fetch
  useEffect(() => {
    fetch('/api/admin/notices')
      .then(r => r.json())
      .then(d => {
        const dismissed = getDismissedIds()
        const popupNotices: PopupNotice[] = (d.notices ?? []).filter(
          (n: { popup?: boolean; id: string }) =>
            n.popup === true && !dismissed.includes(n.id)
        )
        if (popupNotices.length > 0) {
          setQueue(popupNotices)
          setCurrent(popupNotices[0])
          setDontShow(false)
        }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  const handleClose = () => {
    if (!current) return

    if (dontShow) {
      addDismissedId(current.id)
    }

    const remainingQueue = queue.slice(1)
    // 남은 큐에서 이미 dismissed된 것 제외
    const dismissed = getDismissedIds()
    const nextQueue = remainingQueue.filter(n => !dismissed.includes(n.id))

    if (nextQueue.length > 0) {
      setCurrent(nextQueue[0])
      setQueue(nextQueue)
      setDontShow(false)
    } else {
      setCurrent(null)
      setQueue([])
    }
  }

  if (!current) return null

  const currentIndex = queue.findIndex(n => n.id === current.id)

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col" style={{ maxHeight: '85vh' }}>
          {/* 스크롤 가능한 콘텐츠 영역 */}
          <div className="overflow-y-auto flex-1">
            {/* 사진 (원본 비율 유지, 클릭 시 확대) */}
            {current.image_url && (
              <img
                src={current.image_url}
                alt={current.title}
                className="w-full object-contain cursor-zoom-in"
                onClick={() => setLightboxOpen(true)}
              />
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
                    {currentIndex + 1} / {queue.length}
                  </span>
                )}
              </div>

              {/* 제목 */}
              <h2 className="text-base font-bold text-gray-900 mb-2">{current.title}</h2>

              {/* 내용 */}
              <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
                {current.content}
              </p>

              {current.event_date && (
                <p className="mt-2 text-xs text-purple-600 font-medium">
                  📅 행사일: {new Date(current.event_date).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
                </p>
              )}
            </div>
          </div>

          {/* 하단 고정 버튼 영역 */}
          <div className="px-5 pb-5 pt-3 flex flex-col gap-3 border-t border-gray-100 shrink-0">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dontShow}
                onChange={e => setDontShow(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-500">오늘 하루 보지 않기 (앱 종료 전까지)</span>
            </label>

            <button
              onClick={handleClose}
              className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              {queue.length > 1 && currentIndex < queue.length - 1
                ? '다음 공지 보기'
                : '확인'}
            </button>
          </div>
        </div>
      </div>

      {/* 사진 확대 라이트박스 */}
      {lightboxOpen && current.image_url && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <img
            src={current.image_url}
            alt={current.title}
            className="max-w-full max-h-full object-contain"
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 text-white/80 hover:text-white text-3xl leading-none font-light"
          >
            ✕
          </button>
        </div>
      )}
    </>
  )
}
