'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { Home, Calendar, BookOpen, User, LogOut, Bell, FileText } from 'lucide-react'

type NavIcon = React.ElementType

interface NavItem {
  href: string
  label: string
  Icon: NavIcon
  exact?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: '/customer', label: '홈', Icon: Home, exact: true },
  { href: '/customer/schedule', label: '서비스 일정', Icon: Calendar },
  { href: '/customer/reports', label: '관리 리포트', Icon: FileText },
  { href: '/customer/guide', label: '이용안내', Icon: BookOpen },
  { href: '/customer/notifications', label: '알림 이력', Icon: Bell },
  { href: '/customer/mypage', label: '마이페이지', Icon: User },
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
        <img
          src="/bbk-logo.png"
          alt="BBK 공간케어"
          className="w-10 h-10 rounded-xl object-cover shrink-0 shadow-soft"
        />
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
              <item.Icon size={16} className="shrink-0" />
              <span className="flex-1">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* 하단 사용자 정보 */}
      <div className="px-3 py-4 border-t border-border-subtle space-y-1">
        <div className="flex items-center gap-2.5 px-3 py-2">
          <div className="w-7 h-7 rounded-full bg-surface-sunken border border-border flex items-center justify-center shrink-0">
            <User size={14} className="text-text-secondary" />
          </div>
          <span className="text-sm font-medium text-text-primary truncate">{userName}</span>
        </div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-text-secondary hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-60"
        >
          <LogOut size={16} className="shrink-0" />
          {loggingOut ? '로그아웃 중...' : '로그아웃'}
        </button>
      </div>
    </aside>
  )
}
