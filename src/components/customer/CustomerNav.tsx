'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/customer', label: '홈', exact: true },
  { href: '/customer/schedule', label: '일정', exact: false },
  { href: '/customer/reports', label: '리포트', exact: false },
  { href: '/customer/requests', label: '요청사항', exact: false },
  { href: '/customer/mypage', label: '마이페이지', exact: false },
]

export function CustomerNav() {
  const pathname = usePathname()

  const isActive = (href: string, exact: boolean) => {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  return (
    <nav className="flex border-t border-gray-100">
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.href, item.exact)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`relative flex-1 text-center py-2.5 text-xs font-medium transition-colors ${
              active ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {item.label}
            {active && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-blue-600 rounded-full" />
            )}
          </Link>
        )
      })}
    </nav>
  )
}
