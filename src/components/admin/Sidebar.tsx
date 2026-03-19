'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'

// ─── 타입 ─────────────────────────────────────────────────────

interface NavLeaf {
  type: 'leaf'
  href: string
  label: string
  icon: string
  roles: string[]
}

interface NavGroup {
  type: 'group'
  label: string
  icon: string
  roles: string[]
  children: { href: string; label: string }[]
}

type NavItem = NavLeaf | NavGroup

// ─── 메뉴 정의 ────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { type: 'leaf', href: '/admin', label: '홈', icon: '🏠', roles: ['admin', 'worker'] },
  {
    type: 'group',
    label: '배정관리',
    icon: '📅',
    roles: ['admin'],
    children: [
      { href: '/admin/calendar', label: '배정캘린더' },
      { href: '/admin/schedule', label: '일정관리' },
    ],
  },
  {
    type: 'group',
    label: '영업관리',
    icon: '🏢',
    roles: ['admin'],
    children: [
      { href: '/admin/customers', label: '고객관리' },
      { href: '/admin/applications', label: '서비스신청' },
    ],
  },
  {
    type: 'group',
    label: '구성원',
    icon: '👥',
    roles: ['admin'],
    children: [
      { href: '/admin/workers', label: '직원정보' },
      { href: '/admin/members', label: '계정관리' },
    ],
  },
  {
    type: 'group',
    label: '정산관리',
    icon: '💹',
    roles: ['admin'],
    children: [
      { href: '/admin/payroll', label: '급여정산' },
      { href: '/admin/finance', label: '매출매입' },
    ],
  },
  { type: 'leaf', href: '/admin/inventory', label: '재고', icon: '📦', roles: ['admin', 'worker'] },
]

// ─── Props ────────────────────────────────────────────────────

interface SidebarProps {
  role: string
  userName: string
}

// ─── 컴포넌트 ─────────────────────────────────────────────────

export function Sidebar({ role, userName }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const isLeafActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)

  const isGroupActive = (children: { href: string }[]) =>
    children.some(c => pathname.startsWith(c.href))

  // 현재 경로가 그룹 안에 있으면 기본 열림
  const defaultOpen = NAV_ITEMS
    .filter((item): item is NavGroup => item.type === 'group')
    .reduce<Record<string, boolean>>((acc, g) => {
      acc[g.label] = isGroupActive(g.children)
      return acc
    }, {})

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(defaultOpen)

  const toggleGroup = (label: string) =>
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }))

  const handleLogout = async () => {
    await fetch('/api/auth/session', { method: 'DELETE' })
    router.push('/login')
  }

  const roleLabel = role === 'admin' ? '관리자' : '직원'
  const roleBadgeClass = role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'

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
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.filter(item => item.roles.includes(role)).map(item => {

          if (item.type === 'leaf') {
            const active = isLeafActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            )
          }

          // group
          const groupActive = isGroupActive(item.children)
          const isOpen = openGroups[item.label] ?? groupActive

          return (
            <div key={item.label}>
              {/* 그룹 헤더 */}
              <button
                onClick={() => toggleGroup(item.label)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  groupActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                <span className="flex-1 text-left">{item.label}</span>
                <span className={`text-xs transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>›</span>
              </button>

              {/* 서브 메뉴 */}
              {isOpen && (
                <div className="ml-4 mt-0.5 space-y-0.5 border-l-2 border-gray-100 pl-3">
                  {item.children.map(child => {
                    const childActive = pathname.startsWith(child.href)
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          childActive
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                        }`}
                      >
                        {child.label}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* 하단 사용자 정보 */}
      <div className="px-3 py-4 border-t border-gray-100 space-y-1">
        <div className="px-3 py-2 text-sm text-gray-700 font-medium">{userName}</div>
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
