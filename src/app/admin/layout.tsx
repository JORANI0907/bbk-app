import { SidebarWithBadges } from '@/components/admin/SidebarWithBadges'
import { AdminMobileNav } from '@/components/admin/AdminMobileNav'
import { PopupNoticeController } from '@/components/admin/PopupNoticeController'
import { getServerSession } from '@/lib/session'
import { redirect } from 'next/navigation'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = getServerSession()

  if (!session) redirect('/login')

  const role = session.role
  const userName = session.name

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* 데스크탑 사이드바 (badges 포함) */}
      <SidebarWithBadges role={role} userName={userName} />

      {/* 메인 콘텐츠 */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 p-4 md:p-8 pb-24 md:pb-8">
          {children}
        </div>
      </main>

      {/* 모바일 하단 탭바 */}
      <AdminMobileNav role={role} />

      {/* 팝업 공지 컨트롤러 */}
      <PopupNoticeController />
    </div>
  )
}
