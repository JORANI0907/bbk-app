import { CustomerSidebar } from '@/components/customer/CustomerSidebar'
import { CustomerMobileNav } from '@/components/customer/CustomerMobileNav'
import { ScheduleChangeFAB } from '@/components/customer/ScheduleChangeFAB'
import { PreviewBanner } from '@/components/customer/PreviewBanner'
import { BranchSwitcherFAB } from '@/components/franchise/BranchSwitcherFAB'
import { PushNotificationProvider } from '@/components/shared/PushNotificationProvider'
import DevRoleSwitcher from '@/components/DevRoleSwitcher'
import { getCustomerSession } from '@/lib/session'
import { redirect } from 'next/navigation'

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = getCustomerSession()
  if (!session) redirect('/login')

  const isFranchiseView = session.isPreview && session.originRole === 'franchise_hq'
  // 본사 모드는 floating 버튼(FAB)으로 표시 → 상단 패딩 불필요
  const isAdminPreview = session.isPreview && !isFranchiseView

  return (
    <div className={`flex h-screen overflow-hidden bg-surface-sunken ${isAdminPreview ? 'pt-10' : ''}`}>
      {/* 관리자 미리보기 — 상단 배너 유지 */}
      {isAdminPreview && <PreviewBanner userName={session.name} />}

      {/* 본사 모드 — 좌측 하단 floating 버튼 (일정변경 FAB과 겹치지 않도록 좌측) */}
      {isFranchiseView && <BranchSwitcherFAB branchName={session.name} />}

      {/* 데스크탑 사이드바 */}
      <CustomerSidebar userName={session.name} userId={session.userId} />

      {/* 메인 콘텐츠 */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 pb-20 md:pb-0 overflow-y-auto min-h-0">
          <div className="max-w-2xl mx-auto w-full">
            {children}
          </div>
        </div>
      </main>

      {/* 모바일 하단 탭바 */}
      <CustomerMobileNav userId={session.userId} />

      {/* 일정 변경 요청 FAB */}
      <ScheduleChangeFAB userId={session.userId} />

      {/* Web Push 구독 등록 (미리보기 모드에서는 비활성) */}
      {!session.isPreview && (
        <PushNotificationProvider userId={session.userId} userType="customer" />
      )}

      {/* 본사 모드에서는 DEV 버튼 숨김 (혼동 방지) */}
      {!isFranchiseView && <DevRoleSwitcher />}
    </div>
  )
}
