'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

interface NavItem {
  href: string
  label: string
  icon: string
  roles: string[]
}

const NAV_ITEMS: NavItem[] = [
  { href: '/admin', label: '홈', icon: '🏠', roles: ['admin', 'worker'] },
  { href: '/admin/calendar', label: '배정캘린더', icon: '📅', roles: ['admin'] },
  { href: '/admin/clients', label: '영업관리', icon: '🏢', roles: ['admin'] },
  { href: '/admin/team', label: '구성원', icon: '👥', roles: ['admin'] },
  { href: '/admin/inventory', label: '재고', icon: '📦', roles: ['admin', 'worker'] },
]

interface SidebarProps {
  role: string
  userName: string
}

export function Sidebar({ role, userName }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    await fetch('/api/auth/session', { method: 'DELETE' })
    router.push('/login')
  }

  const isActive = (href: string) => {
    if (href === '/admin') {
      return pathname === '/admin'
    }
    return pathname.startsWith(href)
  }

  const visibleItems = NAV_ITEMS.filter(item => item.roles.includes(role))

  const roleLabel = role === 'admin' ? '관리자' : '직원'
  const roleBadgeClass = role === 'admin'
    ? 'bg-blue-100 text-blue-700'
    : 'bg-green-100 text-green-700'

  return (
    <aside className="hidden md:flex flex-col w-64 min-h-screen bg-white border-r border-gray-200">
      {/* 로고 */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100">
        <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-sm">B</span>
        </div>
        <div>
          <p className="font-bold text-gray-900 leading-tight">BBK 공간케어</p>
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${roleBadgeClass}`}>
            {roleLabel}
          </span>
        </div>
      </div>

      {/* 메뉴 */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {visibleItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive(item.href)
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      {/* 하단 사용자 정보 및 로그아웃 */}
      <div className="px-3 py-4 border-t border-gray-100 space-y-1">
        <div className="px-3 py-2 text-sm text-gray-700 font-medium">
          {userName}
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <span className="text-base">🚪</span>
          로그아웃
        </button>
      </div>
    </aside>
  )
}
