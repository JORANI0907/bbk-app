import { getServerSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { WorkerHomeClient } from '@/components/worker/WorkerHomeClient'
import { AdminScheduleMonitor } from '@/components/worker/AdminScheduleMonitor'
import { TodayLabel } from '@/components/worker/TodayLabel'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function WorkerHomePage() {
  const session = getServerSession()
  if (!session || (session.role !== 'worker' && session.role !== 'admin')) redirect('/login')

  if (session.role === 'admin') {
    return (
      <div className="px-4 py-5">
        <div className="mb-5">
          <TodayLabel className="text-xs text-gray-400 font-medium mb-1 block" />
          <h1 className="text-xl font-bold text-gray-900">현장 진행 현황</h1>
          <p className="text-sm text-gray-500 mt-1">날짜별 전체 직원 현장 상태를 확인합니다.</p>
        </div>
        <AdminScheduleMonitor initialDate="" />
      </div>
    )
  }

  return <WorkerHomeClient />
}
