'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useMemo, useState, useCallback } from 'react'
import { LogOut, HelpCircle, Settings2 } from 'lucide-react'
import { OpsHelpSheet } from '@/components/admin/ops/OpsHelpSheet'
import { NavLayoutEditor } from '@/components/admin/NavLayoutEditor'
import { getNavItemsForRole, COLOR_MAP } from '@/lib/admin-nav-config'
import { mergeNavLayout, type NavLayout } from '@/lib/nav-layout'

// ─── Props ────────────────────────────────────────────────────

interface SidebarProps {
  role: string
  userName: string
  navBadges?: Record<string, number>
  navLayout?: NavLayout | null
  onLayoutSaved?: (next: NavLayout) => void
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

export function Sidebar({ role, userName, navBadges = {}, navLayout, onLayoutSaved }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  // 저장된 레이아웃을 적용해 최종 렌더 목록 도출
  const baseItems = useMemo(() => getNavItemsForRole(role), [role])
  const items = useMemo(
    () => (role === 'admin' ? mergeNavLayout(baseItems, navLayout) : baseItems),
    [baseItems, navLayout, role],
  )

  // 클라이언트에서 즉시 dismiss된 키 추적 (서버 응답 전 즉시 뱃지 제거용)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const getBadgeCount = useCallback((key: string | undefined) => {
    if (!key || dismissed.has(key)) return 0
    return navBadges[key] ?? 0
  }, [dismissed, navBadges])

  const handleNavClick = useCallback((badgeKey?: string) => {
    if (!badgeKey) return
    setDismissed(prev => new Set(prev).add(badgeKey))
    fetch(`/api/admin/nav-badges?key=${badgeKey}`, { method: 'DELETE' })
      .then(() => router.refresh())
      .catch(() => {/* 무시 */})
  }, [router])

  const isLeafActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)

  const isGroupActive = (children: { href: string }[]) =>
    children.some(c => pathname.startsWith(c.href))

  const defaultOpen = items
    .filter((item): item is Extract<typeof items[number], { type: 'group' }> => item.type === 'group')
    .reduce<Record<string, boolean>>((acc, g) => {
      acc[g.label] = isGroupActive(g.children)
      return acc
    }, {})

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(defaultOpen)
  const toggleGroup = (label: string) =>
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }))

  const [helpOpen, setHelpOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)

  const handleLogout = async () => {
    await fetch('/api/auth/session', { method: 'DELETE' })
    router.push('/login')
  }

  const roleLabel = role === 'admin' ? '관리자' : '직원'
  const roleBadgeClass = role === 'admin' ? 'bg-brand-100 text-brand-700' : 'bg-brand-50 text-brand-600'

  const getGroupBadgeCount = (children: { href: string; badgeKey?: string }[]) =>
    children.reduce((sum, c) => sum + getBadgeCount(c.badgeKey), 0)

  return (
    <>
    <aside className="hidden md:flex flex-col w-64 h-screen sticky top-0 bg-surface border-r border-border">
      {/* 로고 */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-border-subtle">
        <img src="/icons/icon-192x192.png" alt="BBK 공간케어 로고" className="w-10 h-10 rounded-xl object-cover shadow-soft" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-text-primary leading-tight truncate">BBK 공간케어</p>
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${roleBadgeClass}`}>
            {roleLabel}
          </span>
        </div>
        {role === 'admin' && (
          <button
            type="button"
            onClick={() => setEditorOpen(true)}
            aria-label="탭 순서 편집"
            title="탭 순서 편집"
            className="shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-lg text-text-tertiary hover:bg-surface-sunken hover:text-brand-600 transition-colors"
          >
            <Settings2 size={16} />
          </button>
        )}
      </div>

      {/* 메뉴 */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {items.map(item => {
          if (item.type === 'leaf') {
            const active = isLeafActive(item.href)
            const count = getBadgeCount(item.badgeKey)
            const c = item.colorKey ? COLOR_MAP[item.colorKey] : null
            return (
              <Link
                key={`leaf:${item.id}`}
                href={item.href}
                onClick={() => handleNavClick(item.badgeKey)}
                className={`nav-item-toss flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm ${
                  active
                    ? `${c?.activeBg ?? 'bg-brand-50'} ${c?.activeText ?? 'text-brand-700'} font-semibold shadow-card`
                    : `font-medium text-text-secondary ${c?.hover ?? 'hover:bg-surface-sunken'} hover:text-text-primary`
                }`}
              >
                <span className={`text-base ${c?.icon ?? ''}`}>{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                <NavBadge count={count} />
              </Link>
            )
          }

          // group
          const groupActive = isGroupActive(item.children)
          const isOpen = openGroups[item.label] ?? groupActive
          const groupBadgeCount = getGroupBadgeCount(item.children)
          const c = item.colorKey ? COLOR_MAP[item.colorKey] : null

          return (
            <div key={`group:${item.id}`}>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => toggleGroup(item.label)}
                  className={`nav-item-toss flex-1 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm ${
                    groupActive || isOpen
                      ? `${c?.activeBg ?? 'bg-brand-50'} ${c?.activeText ?? 'text-brand-700'} font-semibold`
                      : `font-medium text-text-secondary ${c?.hover ?? 'hover:bg-surface-sunken'} hover:text-text-primary`
                  }`}
                >
                  <span className={`text-base ${c?.icon ?? ''}`}>{item.icon}</span>
                  <span className="flex-1 text-left">{item.label}</span>
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

              {isOpen && (
                <div className={`ml-4 mt-0.5 space-y-0.5 border-l-2 pl-3 ${c?.border ?? 'border-border-subtle'}`}>
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
                            ? `${c?.childActiveBg ?? 'bg-brand-50'} ${c?.childActiveText ?? 'text-brand-700'} font-semibold shadow-card`
                            : `font-medium text-text-secondary ${c?.hover ?? 'hover:bg-surface-sunken'} hover:text-text-primary`
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

    {role === 'admin' && (
      <NavLayoutEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        initialItems={items}
        defaultItems={baseItems}
        onSaved={(next) => onLayoutSaved?.(next)}
      />
    )}
    </>
  )
}
