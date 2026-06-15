import { CustomerSidebar } from '@/components/customer/CustomerSidebar'
import { CustomerMobileNav } from '@/components/customer/CustomerMobileNav'
import { ScheduleChangeFAB } from '@/components/customer/ScheduleChangeFAB'
import { PreviewBanner } from '@/components/customer/PreviewBanner'
import { PushNotificationProvider } from '@/components/shared/PushNotificationProvider'
import { getCustomerSession } from '@/lib/session'
import { redirect } from 'next/navigation'

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = getCustomerSession()
  if (!session) redirect('/login')

  return (
    <div className={`flex h-screen overflow-hidden bg-surface-sunken ${session.isPreview ? 'pt-10' : ''}`}>
      {/* 관리자 미리보기 배너 */}
      {session.isPreview && <PreviewBanner userName={session.name} />}

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

      {/* 일정 변경 요청 FAB */}
      <ScheduleChangeFAB />

      {/* Web Push 구독 등록 (미리보기 모드에서는 비활성) */}
      {!session.isPreview && (
        <PushNotificationProvider userId={session.userId} userType="customer" />
      )}
    </div>
  )
}
