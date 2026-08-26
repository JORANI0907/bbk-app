'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useCallback } from 'react'
import { Trash2, Home, Building2, Users, TrendingUp, Settings, LogOut, Activity, HelpCircle, Map as MapIcon } from 'lucide-react'
import { OpsHelpSheet } from '@/components/admin/ops/OpsHelpSheet'

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
  hasHelp?: boolean
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
      { href: '/admin/customers', label: '고객관리' },
      { href: '/admin/customer-history', label: '고객DB이력' },
      { href: '/admin/franchise-hq', label: '프렌차이즈 본사' },
      { href: '/admin/quotes', label: '견적관리' },
      { href: '/admin/contracts', label: '계약서 관리' },
      { href: '/admin/snippets', label: '문자 단축어' },
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
      // 워커도 문자 단축어 접근 허용 — API 가 worker_visible=true 만 필터해서 반환.
      { href: '/admin/snippets', label: '문자 단축어' },
    ],
  },
  {
    type: 'group',
    label: '인사·현장관리',
    icon: <Users size={16} />,
    roles: ['admin'],
    children: [
      { href: '/admin/live', label: '오늘의 현장 (라이브)' },
      { href: '/admin/map', label: '지도 대시보드' },
      { href: '/admin/attendance', label: '출퇴근관리' },
      { href: '/admin/regular-care', label: '정기관리' },
      { href: '/admin/workers', label: '직원관리' },
      { href: '/admin/incidents', label: '경위서', badgeKey: 'incidents' },
      { href: '/admin/claims', label: '고객 클레임' },
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
      { href: '/worker/regular-care', label: '정기관리' },
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
      { href: '/admin/tax-invoice', label: '세금계산서 발행' },
    ],
  },
  {
    type: 'group',
    label: '운영',
    icon: <Activity size={16} />,
    roles: ['admin'],
    hasHelp: true,
    children: [
      { href: '/admin/ops/settings/intent', label: '대표 의도' },
      { href: '/admin/ops/settings/metrics', label: '지표 설정' },
      { href: '/admin/ops/settings/functions', label: '기능 담당' },
      { href: '/admin/ops/interviews', label: '분기 면담' },
    ],
  },
  {
    type: 'group',
    label: '앱관리',
    icon: <Settings size={16} />,
    roles: ['admin'],
    children: [
      { href: '/admin/notices', label: '공지·이벤트관리', badgeKey: 'notices' },
      { href: '/admin/events', label: '혜택 페이지 관리' },
      { href: '/admin/automation', label: '자동화관리' },
      { href: '/admin/notification-templates', label: '문자알림 관리' },
      { href: '/admin/push', label: '앱알림 관리' },
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
    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-bold bg-brand-600 text-white rounded-full">
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

  const [helpOpen, setHelpOpen] = useState(false)

  const handleLogout = async () => {
    await fetch('/api/auth/session', { method: 'DELETE' })
    router.push('/login')
  }

  const roleLabel = role === 'admin' ? '관리자' : '직원'
  const roleBadgeClass = role === 'admin' ? 'bg-brand-100 text-brand-700' : 'bg-brand-50 text-brand-600'

  // 그룹 내 자식들의 뱃지 합산 (그룹 헤더에 표시용)
  const getGroupBadgeCount = (children: { href: string; badgeKey?: string }[]) =>
    children.reduce((sum, c) => sum + getBadgeCount(c.badgeKey), 0)

  return (
    <>
    <aside className="hidden md:flex flex-col w-64 h-screen sticky top-0 bg-surface border-r border-border">
      {/* 로고 */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-border-subtle">
        <img src="/icons/icon-192x192.png" alt="BBK 공간케어 로고" className="w-10 h-10 rounded-xl object-cover shadow-soft" />
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
                className={`nav-item-toss flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm ${
                  active
                    ? 'bg-brand-50 text-brand-700 font-semibold shadow-card'
                    : 'font-medium text-text-secondary hover:bg-surface-sunken hover:text-text-primary'
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
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => toggleGroup(item.label)}
                  className={`nav-item-toss flex-1 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm ${
                    groupActive
                      ? 'bg-brand-50 text-brand-700 font-semibold'
                      : 'font-medium text-text-secondary hover:bg-surface-sunken hover:text-text-primary'
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  <span className="flex-1 text-left">{item.label}</span>
                  {/* 접혀있을 때만 그룹 뱃지 표시 */}
                  {!isOpen && <NavBadge count={groupBadgeCount} />}
                  <span className={`text-xs transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>›</span>
                </button>
                {item.hasHelp && (
                  <button
                    type="button"
                    onClick={() => setHelpOpen(true)}
                    aria-label="운영 기능 사용 안내"
                    title="사용 안내"
                    className="shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-md text-text-tertiary hover:text-brand-600 hover:bg-brand-50 transition-colors"
                  >
                    <HelpCircle size={13} />
                  </button>
                )}
              </div>

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
                        className={`nav-item-toss flex items-center px-3 py-2 rounded-lg text-sm ${
                          childActive
                            ? 'bg-brand-50 text-brand-700 font-semibold shadow-card'
                            : 'font-medium text-text-secondary hover:bg-surface-sunken hover:text-text-primary'
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
          className="nav-item-toss flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-text-tertiary hover:bg-surface-sunken hover:text-text-primary"
        >
          <LogOut size={16} />
          로그아웃
        </button>
      </div>
    </aside>
    <OpsHelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  )
}
