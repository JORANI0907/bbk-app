'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Calendar, FileText, BookOpen, LogIn } from 'lucide-react'

type NavIcon = React.ElementType

interface NavItem {
  href: string
  label: string
  Icon: NavIcon
  exact?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: '홈', Icon: Home, exact: true },
  { href: '/schedule', label: '서비스 일정', Icon: Calendar },
  { href: '/care-manual', label: '케어매뉴얼', Icon: FileText },
  { href: '/guide', label: '이용안내', Icon: BookOpen },
]

export function DemoShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

  return (
    <div className="flex min-h-screen bg-surface-sunken">
      {/* 데스크탑 사이드바 */}
      <aside className="hidden md:flex flex-col w-64 h-screen sticky top-0 bg-surface border-r border-border shrink-0">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-border-subtle">
          <img src="/bbk-logo.png" alt="BBK" className="w-10 h-10 rounded-xl object-cover shrink-0 shadow-soft" />
          <div className="min-w-0">
            <p className="font-bold text-text-primary leading-tight truncate">BBK 공간케어</p>
            <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-surface-sunken text-text-tertiary mt-0.5">
              미리보기 화면
            </span>
          </div>
        </div>

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

        <div className="px-3 py-4 border-t border-border-subtle">
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 w-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold py-3 rounded-xl active:scale-[0.98] transition-all shadow-soft"
          >
            <LogIn size={16} />
            로그인 / 계정 사용
          </Link>
          <p className="text-[10px] text-text-tertiary text-center mt-2 leading-tight">
            실제 서비스는 로그인 후 이용 가능
          </p>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        {/* 상단 데모 배지 (모바일/데스크탑 공통) */}
        <div className="sticky top-0 z-30 bg-surface/95 backdrop-blur-sm border-b border-border-subtle">
          <div className="max-w-2xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full bg-surface-sunken text-text-tertiary border border-border">
              <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary" />
              미리보기 화면 (DEMO)
            </span>
            <Link
              href="/login"
              className="md:hidden inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700"
            >
              <LogIn size={12} />
              로그인
            </Link>
          </div>
        </div>

        <div className="flex-1 pb-20 md:pb-0">
          <div className="max-w-2xl mx-auto w-full">{children}</div>
        </div>

        {/* 모바일 하단 nav */}
        <nav className="fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur-sm border-t border-border-subtle md:hidden z-40 safe-area-pb shadow-[0_-1px_12px_rgba(0,0,0,0.06)]">
          <div className="flex">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href, item.exact)
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
                  <item.Icon size={20} className="shrink-0" />
                  <span className="text-[11px] font-medium leading-none">{item.label}</span>
                </Link>
              )
            })}
          </div>
        </nav>
      </main>
    </div>
  )
}
