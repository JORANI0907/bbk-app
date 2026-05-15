import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { redirect } from 'next/navigation'
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
    .is('deleted_at', null)
    .order('scheduled_date', { ascending: false })

  const allSchedules = (schedules ?? []) as ScheduleWithConstruction[]

  const today = new Date().toISOString().slice(0, 10)

  // 예정: 오늘 이후 날짜이면서 완료/취소 처리되지 않은 일정
  const upcoming = allSchedules.filter((s) =>
    s.scheduled_date >= today &&
    s.status !== 'completed' &&
    s.status !== 'cancelled'
  )

  // 완료: 날짜가 지났거나 완료/취소 처리된 일정
  const past = allSchedules.filter((s) =>
    s.scheduled_date < today ||
    s.status === 'completed' ||
    s.status === 'cancelled'
  )

  return (
    <div className="px-4 py-5 flex flex-col gap-4 max-w-2xl mx-auto">
      <ScheduleChangeNoticeBar />
      <ScheduleTabs upcoming={upcoming} past={past} />
    </div>
  )
}
