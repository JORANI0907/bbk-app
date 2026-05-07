import { BottomNav } from '@/components/worker/BottomNav'
import { TodayLabel } from '@/components/worker/TodayLabel'
import { PushNotificationProvider } from '@/components/shared/PushNotificationProvider'
import { getServerSession } from '@/lib/session'

export default function WorkerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = getServerSession()

  return (
    <div className="min-h-screen bg-surface-sunken flex flex-col">
      <header className="sticky top-0 z-40 bg-surface/95 backdrop-blur-sm border-b border-border-subtle safe-area-pt shadow-flat">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2.5">
            <img src="/bbk-logo.png" alt="BBK 공간케어" className="w-8 h-8 rounded-lg object-cover" />
            <span className="text-sm font-bold text-text-primary">BBK 공간케어</span>
          </div>
          <TodayLabel className="text-xs font-medium text-text-secondary bg-surface-sunken px-3 py-1.5 rounded-lg" />
        </div>
      </header>

      <main className="flex-1 pb-20 max-w-xl mx-auto w-full">{children}</main>

      <BottomNav />

      {/* Web Push 구독 등록 */}
      {session && (
        <PushNotificationProvider userId={session.userId} userType="worker" />
      )}
    </div>
  )
}
