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
    .order('scheduled_date', { ascending: false })

  const allSchedules = (schedules ?? []) as ScheduleWithConstruction[]

  // 예정: 워커가 완료/취소 처리하지 않은 일정 (날짜 무관)
  const upcoming = allSchedules.filter((s) =>
    s.status !== 'completed' && s.status !== 'cancelled'
  )

  // 완료: 워커가 실제로 완료 또는 취소 처리한 일정만
  const past = allSchedules.filter((s) =>
    s.status === 'completed' || s.status === 'cancelled'
  )

  return (
    <div className="px-4 py-5 flex flex-col gap-4 max-w-2xl mx-auto">
      <ScheduleChangeNoticeBar />
      <ScheduleTabs upcoming={upcoming} past={past} />
    </div>
  )
}
