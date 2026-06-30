'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useCallback } from 'react'
import { Trash2, Home, Building2, Users, TrendingUp, Settings, LogOut } from 'lucide-react'

// ─── 타입 ─────────────────────────────────────────────────────

interface NavLeaf {
  type: 'leaf'
  href: string
  label: string
  icon: ReactNode
  roles: string[]
  badgeKey?: string  // nav_dismissed key for this item
}

interface NavGroup {
  type: 'group'
  label: string
  icon: ReactNode
  roles: string[]
  children: { href: string; label: string; badgeKey?: string }[]
}

type NavItem = NavLeaf | NavGroup

// ─── 메뉴 정의 ────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { type: 'leaf', href: '/admin', label: '홈', icon: <Home size={16} />, roles: ['admin', 'worker'] },
  {
    type: 'group',
    label: '영업관리',
    icon: <Building2 size={16} />,
    roles: ['admin'],
    children: [
      { href: '/admin/schedule', label: '배정관리', badgeKey: 'schedule' },
      { href: '/admin/applications', label: '서비스관리', badgeKey: 'applications' },
      { href: '/admin/customers', label: '고객관리' },
      { href: '/admin/franchise-hq', label: '프렌차이즈 본사' },
      { href: '/admin/quotes', label: '견적관리' },
      { href: '/admin/contracts', label: '계약서 관리' },
      { href: '/admin/reports', label: '월간보고서' },
    ],
  },
  {
    type: 'group',
    label: '영업관리',
    icon: <Building2 size={16} />,
    roles: ['worker'],
    children: [
      { href: '/admin/schedule', label: '배정관리', badgeKey: 'schedule' },
      { href: '/admin/customers', label: '고객관리' },
    ],
  },
  {
    type: 'group',
    label: '인사·현장관리',
    icon: <Users size={16} />,
    roles: ['admin'],
    children: [
      { href: '/admin/attendance', label: '출퇴근관리' },
      { href: '/admin/workers', label: '직원관리' },
      { href: '/admin/incidents', label: '경위서', badgeKey: 'incidents' },
      { href: '/admin/inventory', label: '재고관리', badgeKey: 'inventory' },
      { href: '/admin/requests', label: '요청관리', badgeKey: 'requests' },
    ],
  },
  {
    type: 'group',
    label: '인사·현장관리',
    icon: <Users size={16} />,
    roles: ['worker'],
    children: [
      { href: '/admin/attendance', label: '출퇴근관리' },
      { href: '/admin/workers', label: '직원관리' },
      { href: '/admin/incidents', label: '경위서', badgeKey: 'incidents' },
      { href: '/admin/inventory', label: '재고관리', badgeKey: 'inventory' },
      { href: '/worker/requests', label: '요청하기', badgeKey: 'worker_requests' },
    ],
  },
  {
    type: 'group',
    label: '재무관리',
    icon: <TrendingUp size={16} />,
    roles: ['admin'],
    children: [
      { href: '/admin/finance', label: '재무 대시보드' },
      { href: '/admin/finance/details', label: '매출매입 상세' },
      { href: '/admin/payroll', label: '급여정산' },
    ],
  },
  {
    type: 'group',
    label: '앱관리',
    icon: <Settings size={16} />,
    roles: ['admin'],
    children: [
      { href: '/admin/notices', label: '공지·이벤트관리', badgeKey: 'notices' },
      { href: '/admin/automation', label: '자동화관리' },
      { href: '/admin/push', label: '푸시알림 관리' },
      { href: '/admin/nav-settings', label: '하단 메뉴 설정' },
      { href: '/admin/permissions', label: '탭 권한 설정' },
      { href: '/admin/members', label: '회원관리' },
    ],
  },
  {
    type: 'group',
    label: '앱관리',
    icon: <Settings size={16} />,
    roles: ['worker'],
    children: [
      { href: '/admin/account', label: '계정관리' },
    ],
  },
  { type: 'leaf', href: '/admin/trash', label: '휴지통', icon: <Trash2 size={16} />, roles: ['admin'] },
]

// ─── Props ────────────────────────────────────────────────────

interface SidebarProps {
  role: string
  userName: string
  navBadges?: Record<string, number>
}

// ─── 뱃지 컴포넌트 ────────────────────────────────────────────

function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-bold bg-red-500 text-white rounded-full">
      {count > 99 ? '99+' : count}
    </span>
  )
}

// ─── 컴포넌트 ─────────────────────────────────────────────────

export function Sidebar({ role, userName, navBadges = {} }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  // 클라이언트에서 즉시 dismiss된 키 추적 (서버 응답 전 즉시 뱃지 제거용)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const getBadgeCount = useCallback((key: string | undefined) => {
    if (!key || dismissed.has(key)) return 0
    return navBadges[key] ?? 0
  }, [dismissed, navBadges])

  const handleNavClick = useCallback((badgeKey?: string) => {
    if (!badgeKey) return
    // 즉시 로컬 dismiss
    setDismissed(prev => new Set(prev).add(badgeKey))
    // 서버에 기록 (fire-and-forget)
    fetch(`/api/admin/nav-badges?key=${badgeKey}`, { method: 'DELETE' })
      .then(() => router.refresh())
      .catch(() => {/* 무시 */})
  }, [router])

  const isLeafActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)

  const isGroupActive = (children: { href: string }[]) =>
    children.some(c => pathname.startsWith(c.href))

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
  const roleBadgeClass = role === 'admin' ? 'bg-brand-100 text-brand-700' : 'bg-green-100 text-green-700'

  // 그룹 내 자식들의 뱃지 합산 (그룹 헤더에 표시용)
  const getGroupBadgeCount = (children: { href: string; badgeKey?: string }[]) =>
    children.reduce((sum, c) => sum + getBadgeCount(c.badgeKey), 0)

  return (
    <aside className="hidden md:flex flex-col w-64 h-screen sticky top-0 bg-surface border-r border-border">
      {/* 로고 */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-border-subtle">
        <img src="/bbk-logo.png" alt="BBK 공간케어 로고" className="w-10 h-10 rounded-xl object-cover shadow-soft" />
        <div>
          <p className="font-bold text-text-primary leading-tight">BBK 공간케어</p>
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${roleBadgeClass}`}>
            {roleLabel}
          </span>
        </div>
      </div>

      {/* 메뉴 */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {NAV_ITEMS.filter(item => item.roles.includes(role)).map(item => {

          if (item.type === 'leaf') {
            const active = isLeafActive(item.href)
            const count = getBadgeCount(item.badgeKey)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => handleNavClick(item.badgeKey)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-brand-600 text-white'
                    : 'text-text-secondary hover:bg-surface-sunken hover:text-text-primary'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                <NavBadge count={count} />
              </Link>
            )
          }

          // group
          const groupActive = isGroupActive(item.children)
          const isOpen = openGroups[item.label] ?? groupActive
          const groupBadgeCount = getGroupBadgeCount(item.children)

          return (
            <div key={item.label}>
              {/* 그룹 헤더 */}
              <button
                onClick={() => toggleGroup(item.label)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  groupActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-text-secondary hover:bg-surface-sunken hover:text-text-primary'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                <span className="flex-1 text-left">{item.label}</span>
                {/* 접혀있을 때만 그룹 뱃지 표시 */}
                {!isOpen && <NavBadge count={groupBadgeCount} />}
                <span className={`text-xs transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>›</span>
              </button>

              {/* 서브 메뉴 */}
              {isOpen && (
                <div className="ml-4 mt-0.5 space-y-0.5 border-l-2 border-border-subtle pl-3">
                  {item.children.map(child => {
                    const childActive = pathname.startsWith(child.href)
                    const childCount = getBadgeCount(child.badgeKey)
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={() => handleNavClick(child.badgeKey)}
                        className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          childActive
                            ? 'bg-brand-600 text-white'
                            : 'text-text-secondary hover:bg-surface-sunken hover:text-text-primary'
                        }`}
                      >
                        <span className="flex-1">{child.label}</span>
                        <NavBadge count={childCount} />
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
      <div className="px-3 py-4 border-t border-border-subtle space-y-1">
        <div className="px-3 py-2 text-sm text-text-primary font-medium">{userName}</div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-text-secondary hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut size={16} />
          로그아웃
        </button>
      </div>
    </aside>
  )
}
