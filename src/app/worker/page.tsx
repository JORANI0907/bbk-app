import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { format } from 'date-fns'
import { ServiceSchedule } from '@/types/database'
import { WorkerScheduleListClient } from '@/components/worker/WorkerScheduleListClient'

export default async function WorkerHomePage() {
  const session = getServerSession()
  if (!session || session.role !== 'worker') redirect('/login')

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
        <p className="text-sm text-gray-500 mt-1">
          총 {typedSchedules.length}건의 일정이 있습니다.
        </p>
      </div>
      <WorkerScheduleListClient schedules={typedSchedules} />
    </div>
  )
}
