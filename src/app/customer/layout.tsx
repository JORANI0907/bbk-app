import { CustomerSidebar } from '@/components/customer/CustomerSidebar'
import { CustomerMobileNav } from '@/components/customer/CustomerMobileNav'
import { ScheduleChangeFAB } from '@/components/customer/ScheduleChangeFAB'
import { getServerSession } from '@/lib/session'
import { redirect } from 'next/navigation'

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = getServerSession()
  if (!session) redirect('/login')

  return (
    <div className="flex h-screen overflow-hidden bg-surface-sunken">
      {/* 데스크탑 사이드바 */}
      <CustomerSidebar userName={session.name} />

      {/* 메인 콘텐츠 */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 pb-20 md:pb-0 overflow-y-auto min-h-0">
          <div className="max-w-2xl mx-auto w-full">
            {children}
          </div>
        </div>
      </main>

      {/* 모바일 하단 탭바 */}
      <CustomerMobileNav />

      {/* 일정 변경 요청 FAB (모바일) */}
      <div className="md:hidden">
        <ScheduleChangeFAB />
      </div>
    </div>
  )
}
