import { Sidebar } from '@/components/admin/Sidebar'
import { getServerSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'

const ADMIN_MOBILE_NAV = [
  { href: '/admin', label: '홈', icon: '🏠' },
  { href: '/admin/calendar', label: '배정캘린더', icon: '📅' },
  { href: '/admin/clients', label: '영업관리', icon: '🏢' },
  { href: '/admin/team', label: '구성원', icon: '👥' },
  { href: '/admin/inventory', label: '재고', icon: '📦' },
]

const WORKER_MOBILE_NAV = [
  { href: '/admin', label: '홈', icon: '🏠' },
  { href: '/admin/inventory', label: '재고', icon: '📦' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = getServerSession()

  if (!session) redirect('/login')

  const role = session.role
  const userName = session.name

  const mobileNav = role === 'worker' ? WORKER_MOBILE_NAV : ADMIN_MOBILE_NAV

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* 데스크탑 사이드바 */}
      <Sidebar role={role} userName={userName} />

      {/* 메인 콘텐츠 */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 p-4 md:p-8 pb-20 md:pb-8">
          {children}
        </div>
      </main>

      {/* 모바일 하단 탭바 */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex md:hidden z-50">
        {mobileNav.map((item) => (
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
