import { BottomNav } from '@/components/worker/BottomNav'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

export default function WorkerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const today = format(new Date(), 'M월 d일 (EEE)', { locale: ko })

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 safe-area-pt">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <span className="text-xl font-black text-blue-600 tracking-tight">BBK</span>
            <span className="text-xs text-gray-400 font-medium">Korea</span>
          </div>
          <span className="text-sm font-medium text-gray-600">{today}</span>
        </div>
      </header>

      <main className="flex-1 pb-16">{children}</main>

      <BottomNav />
    </div>
  )
}
