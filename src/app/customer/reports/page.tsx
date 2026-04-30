import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ServiceSchedule } from '@/types/database'

export default async function CustomerReportsPage() {
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
    .select(
      `
      *,
      closing_checklists(customer_rating)
    `,
    )
    .eq('customer_id', customerId)
    .eq('status', 'completed')
    .order('scheduled_date', { ascending: false })

  const typedSchedules = (schedules ?? []) as (ServiceSchedule & {
    closing_checklists: { customer_rating: number | null }[] | null
  })[]

  const renderStars = (rating: number | null) => {
    if (!rating) return <span className="text-gray-300 text-sm">미평가</span>
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((s) => (
          <span key={s} className={`text-sm ${s <= rating ? 'text-yellow-400' : 'text-gray-200'}`}>
            ★
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className="px-4 py-5">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">서비스 리포트</h1>
        <p className="text-sm text-gray-500 mt-1">완료된 서비스 내역입니다.</p>
      </div>

      {typedSchedules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <span className="text-5xl">📋</span>
          <div>
            <p className="text-base font-semibold text-gray-700">완료된 서비스가 없습니다</p>
            <p className="text-sm text-gray-400 mt-1">서비스 완료 후 리포트를 확인하세요.</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {typedSchedules.map((schedule) => {
            const rating = schedule.closing_checklists?.[0]?.customer_rating ?? null

            return (
              <Link
                key={schedule.id}
                href={`/customer/reports/${schedule.id}`}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center justify-between active:scale-[0.98] transition-transform"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {format(new Date(schedule.scheduled_date), 'yyyy년 M월 d일 (EEE)', {
                      locale: ko,
                    })}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {schedule.items_this_visit.map((i) => i.name).join(', ') || '청소 서비스'}
                  </p>
                  <div className="mt-1.5">{renderStars(rating)}</div>
                </div>
                <span className="text-gray-300 ml-3">›</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
