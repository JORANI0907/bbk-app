import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { ScheduleCard } from '@/components/worker/ScheduleCard'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ServiceSchedule } from '@/types/database'

export default async function WorkerHomePage() {
  const session = getServerSession()
  if (!session || session.role !== 'worker') redirect('/login')

  const supabase = createServiceClient()

  const today = format(new Date(), 'yyyy-MM-dd')

  const { data: schedules } = await supabase
    .from('service_schedules')
    .select(
      `
      *,
      customer:customers(*)
    `,
    )
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

      {typedSchedules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <span className="text-6xl">🌤️</span>
          <div>
            <p className="text-lg font-semibold text-gray-700">오늘 배정된 현장이 없습니다</p>
            <p className="text-sm text-gray-400 mt-1">
              관리자에게 문의하거나 내일 일정을 확인해주세요.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {typedSchedules.map((schedule) => (
            <Link key={schedule.id} href={`/worker/schedule/${schedule.id}`}>
              <ScheduleCard
                schedule={schedule}
                onPress={() => {}}
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
