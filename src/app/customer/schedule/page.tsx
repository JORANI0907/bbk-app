import { createServiceClient } from '@/lib/supabase/server'
import { getCustomerSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { ScheduleTabs, ScheduleWithConstruction } from '@/components/customer/ScheduleTabs'
import { ScheduleChangeNoticeBar } from '@/components/customer/ScheduleChangeNoticeBar'

export default async function CustomerSchedulePage() {
  const session = getCustomerSession()
  if (!session || session.role !== 'customer') redirect('/login')

  const supabase = createServiceClient()

  const { data: customerRow } = await supabase
    .from('customers')
    .select('id, drive_folder_url')
    .eq('user_id', session.userId)
    .maybeSingle()

  if (!customerRow) redirect('/customer')

  const customerId = customerRow.id
  const customerDriveUrl = (customerRow as { drive_folder_url: string | null }).drive_folder_url

  const { data: schedules } = await supabase
    .from('service_schedules')
    .select('*, worker:users(id,name), application:service_applications(construction_time), customer:customers(customer_type)')
    .eq('customer_id', customerId)
    .is('deleted_at', null)
    .order('scheduled_date', { ascending: false })

  const allSchedules = (schedules ?? []) as ScheduleWithConstruction[]

  // 완료된 일정의 closing_checklist를 별도 쿼리로 가져와 in-memory join
  const completedIds = allSchedules.filter(s => s.status === 'completed').map(s => s.id)
  const { data: closingsRaw } = completedIds.length > 0
    ? await supabase
        .from('closing_checklists')
        .select('schedule_id, condition_score, recommended_services, customer_comment')
        .in('schedule_id', completedIds)
    : { data: [] as Array<{ schedule_id: string; condition_score: number | null; recommended_services: unknown; customer_comment: string | null }> }

  const closingsBySchedule: Record<string, { condition_score: number | null; recommended_services: unknown; customer_comment: string | null }> = {}
  for (const c of closingsRaw ?? []) {
    closingsBySchedule[c.schedule_id] = {
      condition_score: c.condition_score,
      recommended_services: c.recommended_services,
      customer_comment: c.customer_comment,
    }
  }

  const today = new Date().toISOString().slice(0, 10)

  const upcoming = allSchedules.filter((s) =>
    s.scheduled_date >= today &&
    s.status !== 'completed' &&
    s.status !== 'cancelled'
  )

  const past = allSchedules.filter((s) =>
    s.scheduled_date < today ||
    s.status === 'completed' ||
    s.status === 'cancelled'
  )

  return (
    <div className="px-4 py-5 flex flex-col gap-4 max-w-2xl mx-auto">
      <ScheduleChangeNoticeBar />
      <ScheduleTabs
        upcoming={upcoming}
        past={past}
        driveFolderUrl={customerDriveUrl}
        closingsBySchedule={closingsBySchedule}
      />
    </div>
  )
}
