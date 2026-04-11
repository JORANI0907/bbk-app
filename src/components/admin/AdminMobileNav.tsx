'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useCallback } from 'react'
import { useModalBackButton } from '@/hooks/useModalBackButton'

// ─── 메뉴 구조 (Sidebar와 동일) ────────────────────────────────

interface NavLeaf { type: 'leaf'; href: string; label: string; icon: string; roles: string[]; badgeKey?: string }
interface NavGroup { type: 'group'; label: string; icon: string; roles: string[]; children: { href: string; label: string; badgeKey?: string }[] }
type NavItem = NavLeaf | NavGroup

const NAV_ITEMS: NavItem[] = [
  { type: 'leaf', href: '/admin', label: '홈', icon: '🏠', roles: ['admin', 'worker'] },
  {
    type: 'group', label: '영업관리', icon: '🏢', roles: ['admin'],
    children: [
      { href: '/admin/schedule', label: '배정관리', badgeKey: 'schedule' },
      { href: '/admin/applications', label: '서비스관리', badgeKey: 'applications' },
      { href: '/admin/customers', label: '고객관리' },
      { href: '/admin/reports', label: '월간보고서' },
    ],
  },
  {
    type: 'group', label: '영업관리', icon: '🏢', roles: ['worker'],
    children: [
      { href: '/admin/schedule', label: '배정관리', badgeKey: 'schedule' },
      { href: '/admin/customers', label: '고객관리' },
    ],
  },
  {
    type: 'group', label: '인사·현장관리', icon: '👥', roles: ['admin'],
    children: [
      { href: '/admin/attendance', label: '출퇴근관리' },
      { href: '/admin/workers', label: '직원관리' },
      { href: '/admin/incidents', label: '경위서' },
      { href: '/admin/inventory', label: '재고관리', badgeKey: 'inventory' },
      { href: '/admin/requests', label: '요청관리', badgeKey: 'requests' },
    ],
  },
  {
    type: 'group', label: '인사·현장관리', icon: '👥', roles: ['worker'],
    children: [
      { href: '/admin/attendance', label: '출퇴근관리' },
      { href: '/admin/workers', label: '직원관리' },
      { href: '/admin/incidents', label: '경위서' },
      { href: '/admin/inventory', label: '재고관리', badgeKey: 'inventory' },
      { href: '/admin/my-requests', label: '요청하기', badgeKey: 'worker_requests' },
    ],
  },
  {
    type: 'group', label: '재무관리', icon: '💹', roles: ['admin'],
    children: [
      { href: '/admin/payroll', label: '급여정산' },
      { href: '/admin/finance', label: '매출매입' },
      { href: '/admin/invoices', label: '세금계산서' },
    ],
  },
  {
    type: 'group', label: '앱관리', icon: '⚙️', roles: ['admin'],
    children: [
      { href: '/admin/notices', label: '공지·이벤트관리', badgeKey: 'notices' },
      { href: '/admin/automation', label: '자동화관리' },
      { href: '/admin/members', label: '계정관리' },
      { href: '/admin/nav-settings', label: '메뉴 설정' },
    ],
  },
  {
    type: 'group', label: '앱관리', icon: '⚙️', roles: ['worker'],
    children: [
      { href: '/admin/account', label: '계정관리' },
    ],
  },
  {
    type: 'group', label: '마케팅 에이전트', icon: '🤖', roles: ['admin'],
    children: [
      { href: '/admin/marketing', label: '대시보드' },
      { href: '/admin/marketing/today', label: '콘텐츠' },
      { href: '/admin/marketing/roi', label: 'ROI 성과' },
    ],
  },
]

// ─── 뱃지 컴포넌트 ────────────────────────────────────────────

function MobileBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="absolute -top-1.5 -right-2 inline-flex items-center justify-center min-w-[14px] h-[14px] px-0.5 text-[9px] font-bold bg-red-500 text-white rounded-full">
      {count > 99 ? '9+' : count}
    </span>
  )
}

function DrawerBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-bold bg-red-500 text-white rounded-full">
      {count > 99 ? '99+' : count}
    </span>
  )
}

// ─── 하단 퀵탭 (가장 중요한 5개) ────────────────────────────────

type QuickItem = { href: string; label: string; exact?: boolean; badgeKey?: string; icon: React.ReactNode }

// 선택 가능한 전체 항목 (아이콘 포함) — nav-settings ADMIN_ALL/WORKER_ALL과 동기화
const ADMIN_ALL_ITEMS: QuickItem[] = [
  { href: '/admin', label: '홈', exact: true, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
  { href: '/admin/schedule', label: '배정관리', badgeKey: 'schedule', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
  { href: '/admin/applications', label: '서비스', badgeKey: 'applications', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
  { href: '/admin/customers', label: '고객관리', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
  { href: '/admin/workers', label: '직원정보', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg> },
  { href: '/admin/attendance', label: '출퇴근', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
  { href: '/admin/inventory', label: '재고관리', badgeKey: 'inventory', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg> },
  { href: '/admin/incidents', label: '경위서', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
  { href: '/admin/payroll', label: '급여정산', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
  { href: '/admin/finance', label: '매출매입', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
  { href: '/admin/reports', label: '월간보고서', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
  { href: '/admin/requests', label: '요청관리', badgeKey: 'requests', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> },
  { href: '/admin/notices', label: '공지·이벤트', badgeKey: 'notices', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> },
  { href: '/admin/invoices', label: '세금계산서', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg> },
]

const WORKER_ALL_ITEMS: QuickItem[] = [
  { href: '/admin', label: '홈', exact: true, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
  { href: '/admin/schedule', label: '일정', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
  { href: '/admin/customers', label: '고객관리', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg> },
  { href: '/admin/attendance', label: '출퇴근', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
  { href: '/admin/inventory', label: '재고관리', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg> },
  { href: '/admin/incidents', label: '경위서', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
  { href: '/admin/my-requests', label: '요청하기', badgeKey: 'worker_requests', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> },
]

// 기본 퀵탭 (설정이 없을 때)
const ADMIN_QUICK = ADMIN_ALL_ITEMS.slice(0, 4)
const WORKER_QUICK = WORKER_ALL_ITEMS.slice(0, 4)

interface Props {
  role: string
  unreadIncidentCount?: number
  navConfig?: Record<string, string[]>
  navBadges?: Record<string, number>
}

export function AdminMobileNav({ role, unreadIncidentCount = 0, navConfig = {}, navBadges = {} }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const getBadgeCount = useCallback((key: string | undefined) => {
    if (!key || dismissed.has(key)) return 0
    if (key === 'incidents') return unreadIncidentCount
    return navBadges[key] ?? 0
  }, [dismissed, navBadges, unreadIncidentCount])

  const handleNavClick = useCallback((badgeKey?: string) => {
    if (!badgeKey) return
    setDismissed(prev => new Set(prev).add(badgeKey))
    fetch(`/api/admin/nav-badges?key=${badgeKey}`, { method: 'DELETE' })
      .then(() => router.refresh())
      .catch(() => {/* 무시 */})
  }, [router])

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // 오류 무시하고 로그인 페이지로 이동
    }
    sessionStorage.removeItem('splashShown')
    router.push('/login')
  }

  useModalBackButton(drawerOpen, () => setDrawerOpen(false))

  // navConfig 설정이 있으면 동적으로 생성, 없으면 기본값 사용
  const configKey = role === 'worker' ? 'nav_quick_worker' : 'nav_quick_admin'
  const configuredHrefs = navConfig[configKey]

  const ALL_ITEMS_MAP = role === 'worker'
    ? Object.fromEntries(WORKER_ALL_ITEMS.map(i => [i.href, i]))
    : Object.fromEntries(ADMIN_ALL_ITEMS.map(i => [i.href, i]))

  const quickItems = configuredHrefs
    ? configuredHrefs.map(href => ALL_ITEMS_MAP[href]).filter(Boolean)
    : (role === 'worker' ? WORKER_QUICK : ADMIN_QUICK)
  const allItems = NAV_ITEMS.filter(item => item.roles.includes(role))

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

  const isGroupActive = (children: { href: string }[]) =>
    children.some(c => pathname.startsWith(c.href))

  return (
    <>
      {/* 하단 퀵탭 */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-100 md:hidden z-50 safe-area-pb shadow-[0_-1px_12px_rgba(0,0,0,0.06)]">
        <div className="flex">
          {quickItems.map((item) => {
            const active = isActive(item.href, item.exact)
            const badgeKey = item.href === '/admin/incidents' ? 'incidents' : item.badgeKey
            const count = getBadgeCount(badgeKey)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => handleNavClick(badgeKey)}
                className={`relative flex-1 flex flex-col items-center justify-center py-2 gap-1 transition-colors ${
                  active ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-brand-600 rounded-full" />
                )}
                <span className="relative">
                  {item.icon}
                  <MobileBadge count={count} />
                </span>
                <span className="text-[11px] font-medium leading-none">{item.label}</span>
              </Link>
            )
          })}
          {/* 더보기 버튼 */}
          <button
            onClick={() => setDrawerOpen(true)}
            className={`relative flex-1 flex flex-col items-center justify-center py-2 gap-1 transition-colors ${
              drawerOpen ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
            <span className="text-[11px] font-medium leading-none">더보기</span>
          </button>
        </div>
      </nav>

      {/* 전체 메뉴 드로어 */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[60] md:hidden" onClick={() => setDrawerOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-2xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* 드로어 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <img src="/bbk-logo.png" alt="BBK" className="w-8 h-8 rounded-lg object-cover" />
                <div>
                  <p className="text-sm font-black text-gray-900 leading-none">BBK 공간케어</p>
                  <p className="text-[10px] text-gray-400 font-medium uppercase tracking-widest mt-0.5">Management</p>
                </div>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none p-1">✕</button>
            </div>

            {/* 메뉴 목록 */}
            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
              {allItems.map((item, idx) => {
                if (item.type === 'leaf') {
                  const active = isActive(item.href, item.href === '/admin')
                  const badgeKey = item.href === '/admin/incidents' ? 'incidents' : item.badgeKey
                  const count = getBadgeCount(badgeKey)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => { setDrawerOpen(false); handleNavClick(badgeKey) }}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        active ? 'bg-brand-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <span className="text-base">{item.icon}</span>
                      <span className="flex-1">{item.label}</span>
                      <DrawerBadge count={count} />
                    </Link>
                  )
                }

                const groupActive = isGroupActive(item.children)
                return (
                  <div key={`${item.label}-${idx}`}>
                    <p className="px-3 pt-3 pb-1 text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                      {item.icon} {item.label}
                    </p>
                    <div className="space-y-0.5 pl-2 border-l-2 border-gray-100 ml-3">
                      {item.children.map(child => {
                        const active = pathname.startsWith(child.href)
                        const childCount = getBadgeCount(child.badgeKey)
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={() => { setDrawerOpen(false); handleNavClick(child.badgeKey) }}
                            className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                              active ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            <span className="flex-1">{child.label}</span>
                            <DrawerBadge count={childCount} />
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </nav>

            {/* 로그아웃 버튼 */}
            <div className="px-4 py-4 border-t border-gray-100 safe-area-pb">
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-red-500 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-60"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 shrink-0">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                <span>{loggingOut ? '로그아웃 중...' : '로그아웃'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
