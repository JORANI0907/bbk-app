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

  // 마감 데이터는 service_applications에 저장됨 (closing_checklists 테이블은 비어있음)
  // service_schedules.application_id로 연결
  const completedSchedules = allSchedules.filter(s => s.status === 'completed')
  const applicationIds = completedSchedules
    .map((s) => (s as { application_id?: string | null }).application_id)
    .filter((id): id is string => !!id)

  const { data: appsRaw } = applicationIds.length > 0
    ? await supabase
        .from('service_applications')
        .select('id, condition_score, recommended_services, customer_memo')
        .in('id', applicationIds)
    : { data: [] as Array<{ id: string; condition_score: number | null; recommended_services: unknown; customer_memo: string | null }> }

  const appsById = new Map<string, { condition_score: number | null; recommended_services: unknown; customer_memo: string | null }>()
  for (const a of appsRaw ?? []) {
    appsById.set(a.id, a)
  }

  const closingsBySchedule: Record<string, { condition_score: number | null; recommended_services: unknown; customer_comment: string | null }> = {}
  for (const s of completedSchedules) {
    const appId = (s as { application_id?: string | null }).application_id
    if (!appId) continue
    const app = appsById.get(appId)
    if (!app) continue
    closingsBySchedule[s.id] = {
      condition_score: app.condition_score,
      recommended_services: app.recommended_services,
      customer_comment: app.customer_memo,
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
