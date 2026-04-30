import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format, isPast, isToday } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ServiceSchedule } from '@/types/database'
import { SCHEDULE_STATUS_LABELS, SCHEDULE_STATUS_COLORS } from '@/lib/constants'
import { ScheduleChangeRequest } from '@/components/customer/ScheduleChangeRequest'

function getDday(date: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}

function ScheduleCard({ schedule }: { schedule: ServiceSchedule }) {
  const scheduledDate = new Date(schedule.scheduled_date)
  const isUpcoming = !isPast(scheduledDate) || isToday(scheduledDate)
  const serviceName =
    schedule.items_this_visit?.map((i) => i.name).join(', ') || '청소 서비스'
  const diff = getDday(schedule.scheduled_date)

  return (
    <div
      className={`bg-white rounded-2xl border p-4 flex flex-col gap-2 ${
        isUpcoming && schedule.status !== 'cancelled'
          ? 'border-blue-100 shadow-sm'
          : 'border-gray-100'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-gray-900">
            {format(scheduledDate, 'yyyy년 M월 d일 (EEE)', { locale: ko })}
          </p>
          {(schedule.scheduled_time_start || schedule.scheduled_time_end) && (
            <p className="text-xs text-gray-400 mt-0.5">
              {schedule.scheduled_time_start}
              {schedule.scheduled_time_end ? ` ~ ${schedule.scheduled_time_end}` : ''}
            </p>
          )}
        </div>
        <span
          className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${
            SCHEDULE_STATUS_COLORS[schedule.status] ?? 'bg-gray-100 text-gray-600'
          }`}
        >
          {SCHEDULE_STATUS_LABELS[schedule.status] ?? schedule.status}
        </span>
      </div>

      <p className="text-sm text-gray-600">{serviceName}</p>

      {isUpcoming && schedule.status !== 'cancelled' && diff >= 0 && (
        <p className="text-xs font-semibold text-blue-600 border-t border-gray-50 pt-2 mt-1">
          {diff === 0 ? '오늘 서비스 예정!' : `D-${diff}`}
        </p>
      )}
    </div>
  )
}

export default async function CustomerSchedulePage() {
  const session = getServerSession()
  if (!session || session.role !== 'customer') redirect('/login')

  const supabase = createServiceClient()

  const { data: customerRow } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', session.userId)
    .maybeSingle()

  if (!customerRow) redirect('/customer')

  const customerId = customerRow.id

  const { data: schedules } = await supabase
    .from('service_schedules')
    .select('*')
    .eq('customer_id', customerId)
    .order('scheduled_date', { ascending: false })

  const allSchedules = (schedules ?? []) as ServiceSchedule[]

  const upcoming = allSchedules.filter((s) => {
    const d = new Date(s.scheduled_date)
    return (
      (!isPast(d) || isToday(d)) &&
      s.status !== 'completed' &&
      s.status !== 'cancelled'
    )
  })

  const past = allSchedules.filter((s) => {
    const d = new Date(s.scheduled_date)
    return (
      s.status === 'completed' ||
      s.status === 'cancelled' ||
      (isPast(d) && !isToday(d))
    )
  })

  return (
    <div className="px-4 py-5 flex flex-col gap-6">
      <ScheduleChangeRequest upcomingSchedules={upcoming} />

      <section>
        <h2 className="text-base font-bold text-gray-900 mb-3">예정된 서비스</h2>
        {upcoming.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-center bg-white rounded-2xl border border-gray-100">
            <span className="text-4xl">📅</span>
            <div>
              <p className="text-sm font-semibold text-gray-700">예정된 서비스가 없습니다</p>
              <p className="text-xs text-gray-400 mt-1">담당자에게 문의해주세요.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {upcoming.map((s) => (
              <ScheduleCard key={s.id} schedule={s} />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="text-base font-bold text-gray-900 mb-3">지난 서비스</h2>
          <div className="flex flex-col gap-3">
            {past.map((s) => (
              s.status === 'completed' ? (
                <Link
                  key={s.id}
                  href={`/customer/reports/${s.id}`}
                  className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-2 active:scale-[0.98] transition-transform"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-gray-900">
                        {format(new Date(s.scheduled_date), 'yyyy년 M월 d일 (EEE)', { locale: ko })}
                      </p>
                      {(s.scheduled_time_start || s.scheduled_time_end) && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {s.scheduled_time_start}{s.scheduled_time_end ? ` ~ ${s.scheduled_time_end}` : ''}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${SCHEDULE_STATUS_COLORS[s.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {SCHEDULE_STATUS_LABELS[s.status] ?? s.status}
                      </span>
                      <span className="text-gray-300 text-sm">›</span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600">
                    {s.items_this_visit?.map((i) => i.name).join(', ') || '청소 서비스'}
                  </p>
                </Link>
              ) : (
                <ScheduleCard key={s.id} schedule={s} />
              )
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
