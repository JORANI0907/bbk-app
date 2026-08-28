'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/kg-audit',           label: '홈' },
  { href: '/kg-audit/services',  label: '서비스 안내' },
  { href: '/kg-audit/refund',    label: '환불 규정' },
  { href: '/kg-audit/subscribe', label: '정기 상품' },
  { href: '/kg-audit/one-time',  label: '1회성 상품' },
] as const

export function KgAuditNav() {
  const pathname = usePathname()

  return (
    <nav className="border-t border-border-subtle bg-surface">
      <div className="max-w-5xl mx-auto px-4 flex gap-1 overflow-x-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'text-brand-600 border-b-2 border-brand-600'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
