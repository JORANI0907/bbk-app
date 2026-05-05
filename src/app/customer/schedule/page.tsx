import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { isPast, isToday } from 'date-fns'
import { ServiceSchedule } from '@/types/database'
import { ScheduleChangeRequest } from '@/components/customer/ScheduleChangeRequest'
import { ScheduleTabs } from '@/components/customer/ScheduleTabs'

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
    .select('*, worker:users(id,name)')
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
    <div className="px-4 py-5 flex flex-col gap-6 max-w-2xl mx-auto">
      <ScheduleChangeRequest upcomingSchedules={upcoming} />
      <ScheduleTabs upcoming={upcoming} past={past} />
    </div>
  )
}
