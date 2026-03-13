import { Sidebar } from '@/components/admin/Sidebar'
import Link from 'next/link'

const MOBILE_NAV = [
  { href: '/admin', label: '대시보드', icon: '📊' },
  { href: '/admin/calendar', label: '일정', icon: '📅' },
  { href: '/admin/customers', label: '고객', icon: '👥' },
  { href: '/admin/workers', label: '직원', icon: '👷' },
  { href: '/admin/monitoring', label: '모니터링', icon: '📡' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* 데스크탑 사이드바 */}
      <Sidebar />

      {/* 메인 콘텐츠 */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 p-4 md:p-8 pb-20 md:pb-8">
          {children}
        </div>
      </main>

      {/* 모바일 하단 탭바 */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex md:hidden z-50">
        {MOBILE_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex-1 flex flex-col items-center justify-center py-2 gap-1 text-gray-500 hover:text-blue-600 transition-colors"
          >
            <span className="text-xl">{item.icon}</span>
            <span className="text-xs">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  )
}
