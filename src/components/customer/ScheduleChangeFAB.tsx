'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { BookOpen } from 'lucide-react'

interface Props {
  userId?: string
}

const BELL_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
)

/**
 * 고객 포털 우측 하단 FAB.
 * - 알림 (노란색)
 * - 이용안내 (브랜드색)
 * 일정변경 모달은 /customer/guide 페이지 하단으로 이동했음.
 */
export function ScheduleChangeFAB({ userId }: Props) {
  const pathname = usePathname()
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!userId || pathname === '/customer/notifications') {
      setUnreadCount(0)
      return
    }
    let cancelled = false
    const fetchCount = async () => {
      try {
        const res = await fetch(`/api/user/notifications/unread-count?userId=${encodeURIComponent(userId)}`)
        if (!res.ok) return
        const json = (await res.json()) as { count: number }
        if (!cancelled) setUnreadCount(json.count ?? 0)
      } catch { /* 무시 */ }
    }
    void fetchCount()
    const timer = setInterval(fetchCount, 30_000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [userId, pathname])

  return (
    <div className="fixed bottom-24 right-4 z-50 flex flex-col items-center gap-3">

      {/* 알림 (노란색) */}
      <Link
        href="/customer/notifications"
        className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
        aria-label="알림"
      >
        <div className="w-12 h-12 rounded-full bg-amber-400 text-white shadow-modal flex items-center justify-center relative hover:bg-amber-500 transition-colors">
          {BELL_ICON}
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
        <span className="text-[10px] font-bold text-amber-600 bg-white/90 px-1.5 py-0.5 rounded-full shadow-sm leading-none">알림</span>
      </Link>

      {/* 이용안내 (브랜드색) */}
      <Link
        href="/customer/guide"
        className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
        aria-label="이용안내"
      >
        <div className="w-14 h-14 rounded-full bg-brand-600 text-white shadow-modal flex items-center justify-center hover:bg-brand-700 transition-colors">
          <BookOpen size={26} />
        </div>
        <span className="text-[10px] font-bold text-brand-600 bg-white/90 px-1.5 py-0.5 rounded-full shadow-sm leading-none">이용안내</span>
      </Link>
    </div>
  )
}
