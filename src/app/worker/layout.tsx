import { BottomNav } from '@/components/worker/BottomNav'
import { TodayLabel } from '@/components/worker/TodayLabel'
import { SidebarWithBadges } from '@/components/admin/SidebarWithBadges'
import { PushNotificationProvider } from '@/components/shared/PushNotificationProvider'
import DevRoleSwitcher from '@/components/DevRoleSwitcher'
import { getServerSession } from '@/lib/session'

// B-후속: PC 에서는 관리자와 동일한 좌측 사이드바(role='worker' 메뉴)를 노출.
// 모바일은 기존 BottomNav 유지. 두 UI 는 반응형으로 상호 배타적으로 표시됨.
export default function WorkerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = getServerSession()
  const role = session?.role ?? 'worker'
  const userName = session?.name ?? ''

  return (
    <div className="min-h-screen bg-surface-sunken md:flex md:h-screen md:overflow-hidden">
      {/* 데스크톱 좌측 사이드바 (자체적으로 hidden md:flex 처리됨) */}
      <SidebarWithBadges role={role} userName={userName} />

      <div className="flex-1 flex flex-col min-w-0 md:overflow-hidden">
        {/* 모바일 헤더 (PC 에서는 숨김) */}
        <header className="md:hidden sticky top-0 z-40 bg-surface/95 backdrop-blur-sm border-b border-border-subtle safe-area-pt shadow-flat">
          <div className="flex items-center justify-between px-4 h-14">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/icon-192x192.png" alt="BBK 공간케어" className="w-8 h-8 rounded-lg object-cover" />
              <span className="text-sm font-bold text-text-primary">BBK 공간케어</span>
            </div>
            <TodayLabel className="text-xs font-medium text-text-secondary bg-surface-sunken px-3 py-1.5 rounded-lg" />
          </div>
        </header>

        <main className="flex-1 pb-20 md:pb-8 max-w-xl md:max-w-none mx-auto md:mx-0 w-full md:p-8 md:overflow-y-auto">
          {children}
        </main>
      </div>

      {/* 모바일 하단 네비 (PC 에서는 숨김) */}
      <div className="md:hidden">
        <BottomNav />
      </div>

      {/* Web Push 구독 등록 */}
      {session && (
        <PushNotificationProvider userId={session.userId} userType="worker" />
      )}

      <DevRoleSwitcher />
    </div>
  )
}
