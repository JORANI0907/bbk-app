import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { isPast, isToday } from 'date-fns'
import { ScheduleTabs, ScheduleWithConstruction } from '@/components/customer/ScheduleTabs'
import { ScheduleChangeNoticeBar } from '@/components/customer/ScheduleChangeNoticeBar'

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
    .select('*, worker:users(id,name), application:service_applications(construction_time)')
    .eq('customer_id', customerId)
    .order('scheduled_date', { ascending: false })

  const allSchedules = (schedules ?? []) as ScheduleWithConstruction[]

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
    <div className="px-4 py-5 flex flex-col gap-4 max-w-2xl mx-auto">
      <ScheduleChangeNoticeBar />
      <ScheduleTabs upcoming={upcoming} past={past} />
    </div>
  )
}
