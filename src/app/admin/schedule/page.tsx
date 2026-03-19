import { getServerSession } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { format } from 'date-fns'
import { ServiceSchedule } from '@/types/database'
import { WorkerScheduleListClient } from '@/components/worker/WorkerScheduleListClient'
import { AdminScheduleMonitor } from '@/components/worker/AdminScheduleMonitor'

export default async function SchedulePage() {
  const session = getServerSession()
  if (!session) redirect('/login')

  if (session.role === 'admin') {
    const today = format(new Date(), 'yyyy-MM-dd')
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">현장일정</h1>
            <p className="text-sm text-gray-500 mt-1">날짜별 전체 현장 진행 현황</p>
          </div>
          <a href="/admin/calendar" className="text-sm text-blue-600 hover:underline">
            배정 캘린더 →
          </a>
        </div>
        <AdminScheduleMonitor initialDate={today} />
      </div>
    )
  }

  // worker: 오늘 본인 배정 일정
  const supabase = createServiceClient()
  const today = format(new Date(), 'yyyy-MM-dd')
  const { data: schedules } = await supabase
    .from('service_schedules')
    .select('*, customer:customers(*)')
    .eq('worker_id', session.userId)
    .eq('scheduled_date', today)
    .order('scheduled_time_start', { ascending: true })

  const typedSchedules = (schedules ?? []) as ServiceSchedule[]

  return (
    <div className="px-4 py-5">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">오늘 배정 현장</h1>
        <p className="text-sm text-gray-500 mt-1">총 {typedSchedules.length}건의 일정이 있습니다.</p>
      </div>
      <WorkerScheduleListClient schedules={typedSchedules} />
    </div>
  )
}
