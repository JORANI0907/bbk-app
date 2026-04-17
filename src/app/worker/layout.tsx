import { BottomNav } from '@/components/worker/BottomNav'
import { TodayLabel } from '@/components/worker/TodayLabel'

export default function WorkerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-100 safe-area-pt shadow-sm">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-1.5">
            <span className="text-xl font-black text-blue-600 tracking-tight">BBK</span>
            <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest">Korea</span>
          </div>
          <TodayLabel className="text-xs font-medium text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg" />
        </div>
      </header>

      <main className="flex-1 pb-16">{children}</main>

      <BottomNav />
    </div>
  )
}
