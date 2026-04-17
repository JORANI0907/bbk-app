import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ServiceSchedule } from '@/types/database'
import { WorkerScheduleListClient } from '@/components/worker/WorkerScheduleListClient'
import { AdminScheduleMonitor } from '@/components/worker/AdminScheduleMonitor'
import { todayKstString, kstNow } from '@/lib/kst'

export default async function WorkerHomePage() {
  const session = getServerSession()
  if (!session || (session.role !== 'worker' && session.role !== 'admin')) redirect('/login')

  const today = todayKstString()
  const todayLabel = format(kstNow(), 'M월 d일 (EEE)', { locale: ko })

  if (session.role === 'admin') {
    return (
      <div className="px-4 py-5">
        <div className="mb-5">
          <p className="text-xs text-gray-400 font-medium mb-1">{todayLabel}</p>
          <h1 className="text-xl font-bold text-gray-900">현장 진행 현황</h1>
          <p className="text-sm text-gray-500 mt-1">날짜별 전체 직원 현장 상태를 확인합니다.</p>
        </div>
        <AdminScheduleMonitor initialDate={today} />
      </div>
    )
  }

  const supabase = createServiceClient()

  const [{ data: schedules }, { data: workerProfile }] = await Promise.all([
    supabase
      .from('service_schedules')
      .select('*, customer:customers(*)')
      .eq('worker_id', session.userId)
      .eq('scheduled_date', today)
      .order('scheduled_time_start', { ascending: true }),
    supabase
      .from('users')
      .select('name')
      .eq('id', session.userId)
      .single(),
  ])

  const typedSchedules = (schedules ?? []) as ServiceSchedule[]
  const workerName = workerProfile?.name ?? ''

  const completedCount = typedSchedules.filter(s => s.status === 'completed').length
  const inProgressCount = typedSchedules.filter(s => s.status === 'in_progress').length

  return (
    <div className="px-4 py-5">
      {/* Greeting header */}
      <div className="mb-5 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl p-5 text-white shadow-lg shadow-blue-200">
        <p className="text-blue-200 text-xs font-medium mb-1">{todayLabel}</p>
        <h1 className="text-lg font-bold leading-tight">
          {workerName ? `${workerName}님, 안녕하세요 👋` : '안녕하세요 👋'}
        </h1>

        <div className="flex items-center gap-3 mt-3">
          <div className="flex-1 bg-white/20 rounded-xl p-3 text-center">
            <p className="text-2xl font-black">{typedSchedules.length}</p>
            <p className="text-[10px] text-blue-100 mt-0.5">오늘 현장</p>
          </div>
          <div className="flex-1 bg-white/20 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-orange-200">{inProgressCount}</p>
            <p className="text-[10px] text-blue-100 mt-0.5">진행 중</p>
          </div>
          <div className="flex-1 bg-white/20 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-green-200">{completedCount}</p>
            <p className="text-[10px] text-blue-100 mt-0.5">완료</p>
          </div>
        </div>
      </div>

      <WorkerScheduleListClient schedules={typedSchedules} />
    </div>
  )
}
