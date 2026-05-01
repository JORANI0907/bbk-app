'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'

const NAV_ITEMS = [
  { href: '/customer', label: '홈', icon: '🏠', exact: true },
  { href: '/customer/schedule', label: '서비스 일정', icon: '📅' },
  { href: '/customer/requests', label: '요청사항', icon: '💬' },
  { href: '/customer/reports', label: '서비스 리포트', icon: '📋' },
  { href: '/customer/mypage', label: '마이페이지', icon: '👤' },
]

interface Props {
  userName: string
}

export function CustomerSidebar({ userName }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await fetch('/api/auth/session', { method: 'DELETE' })
    } catch {
      // 무시
    }
    router.push('/login')
  }

  return (
    <aside className="hidden md:flex flex-col w-64 h-screen sticky top-0 bg-surface border-r border-border shrink-0">
      {/* 로고 */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-border-subtle">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-600 to-brand-700 flex items-center justify-center shrink-0 shadow-soft">
          <span className="text-white font-black text-sm tracking-tighter leading-none">BBK</span>
        </div>
        <div className="min-w-0">
          <p className="font-bold text-text-primary leading-tight truncate">BBK 공간케어</p>
          <span className="inline-block text-xs font-semibold px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 mt-0.5">
            고객 포털
          </span>
        </div>
      </div>

      {/* 메뉴 */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href, item.exact)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-brand-600 text-white shadow-soft'
                  : 'text-text-secondary hover:bg-surface-sunken hover:text-text-primary'
              }`}
            >
              <span className="text-base shrink-0">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* 하단 사용자 정보 */}
      <div className="px-3 py-4 border-t border-border-subtle space-y-1">
        <div className="flex items-center gap-2.5 px-3 py-2">
          <div className="w-7 h-7 rounded-full bg-surface-sunken border border-border flex items-center justify-center shrink-0">
            <span className="text-xs text-text-secondary">👤</span>
          </div>
          <span className="text-sm font-medium text-text-primary truncate">{userName}</span>
        </div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-text-secondary hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-60"
        >
          <span className="text-base shrink-0">🚪</span>
          {loggingOut ? '로그아웃 중...' : '로그아웃'}
        </button>
      </div>
    </aside>
  )
}
