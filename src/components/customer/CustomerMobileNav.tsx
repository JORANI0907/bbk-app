'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

interface NavItem {
  href: string
  label: string
  exact?: boolean
  showBadge?: boolean
  icon: React.ReactNode
}

const BELL_ICON = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-5 h-5"
  >
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
)

const NAV_ITEMS: NavItem[] = [
  {
    href: '/customer',
    label: '홈',
    exact: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
  },
  {
    href: '/customer/schedule',
    label: '일정',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
  {
    href: '/customer/guide',
    label: '이용안내',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    ),
  },
  {
    href: '/customer/notifications',
    label: '알림',
    showBadge: true,
    icon: BELL_ICON,
  },
  {
    href: '/customer/mypage',
    label: '마이페이지',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  },
]

interface Props {
  userId?: string
}

export function CustomerMobileNav({ userId }: Props) {
  const pathname = usePathname()
  const [unreadCount, setUnreadCount] = useState(0)

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

  // 알림 탭이 아닐 때만 미읽음 카운트 조회
  useEffect(() => {
    if (!userId || pathname === '/customer/notifications') {
      setUnreadCount(0)
      return
    }

    let cancelled = false
    const fetchCount = async () => {
      try {
        const res = await fetch(
          `/api/user/notifications/unread-count?userId=${encodeURIComponent(userId)}`,
        )
        if (!res.ok) return
        const json = await res.json() as { count: number }
        if (!cancelled) setUnreadCount(json.count ?? 0)
      } catch {
        // 무시
      }
    }

    void fetchCount()
    const timer = setInterval(fetchCount, 30_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [userId, pathname])

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur-sm border-t border-border-subtle md:hidden z-50 safe-area-pb shadow-[0_-1px_12px_rgba(0,0,0,0.06)]">
      <div className="flex">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href, item.exact)
          const showDot = item.showBadge && unreadCount > 0

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex-1 flex flex-col items-center justify-center py-2 gap-1 transition-colors ${
                active ? 'text-brand-600' : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-brand-600 rounded-full" />
              )}
              <span className="relative">
                {item.icon}
                {showDot && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </span>
              <span className="text-[11px] font-medium leading-none">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
