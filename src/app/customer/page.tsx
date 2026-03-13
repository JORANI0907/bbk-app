import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { DdayCounter } from '@/components/customer/DdayCounter'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ServiceSchedule, Contract } from '@/types/database'
import { SCHEDULE_STATUS_LABELS, SCHEDULE_STATUS_COLORS } from '@/lib/constants'

export default async function CustomerHomePage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: userProfile } = await supabase
    .from('users')
    .select('*, customer:customers(*)')
    .eq('auth_id', user.id)
    .single()

  if (!userProfile || !userProfile.customer) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center gap-4">
        <span className="text-5xl">🏢</span>
        <p className="text-gray-600 font-medium">연결된 고객 정보가 없습니다.</p>
        <p className="text-sm text-gray-400">관리자에게 문의해주세요.</p>
      </div>
    )
  }

  const customer = userProfile.customer

  // 현재 활성 계약 조회
  const { data: activeContract } = await supabase
    .from('contracts')
    .select('*')
    .eq('customer_id', customer.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const contract = activeContract as Contract | null

  // 다음 예정 서비스 조회
  const today = format(new Date(), 'yyyy-MM-dd')
  const { data: nextSchedules } = await supabase
    .from('service_schedules')
    .select('*')
    .eq('customer_id', customer.id)
    .gte('scheduled_date', today)
    .in('status', ['scheduled', 'confirmed'])
    .order('scheduled_date', { ascending: true })
    .limit(1)

  const nextSchedule = (nextSchedules?.[0] ?? null) as ServiceSchedule | null

  // 최근 완료 서비스 조회
  const { data: recentSchedules } = await supabase
    .from('service_schedules')
    .select('*')
    .eq('customer_id', customer.id)
    .eq('status', 'completed')
    .order('scheduled_date', { ascending: false })
    .limit(5)

  const completed = (recentSchedules ?? []) as ServiceSchedule[]

  const SUBSCRIPTION_PLAN_LABELS: Record<string, string> = {
    cycle_3: '3개월',
    cycle_6: '6개월',
    cycle_12: '12개월',
  }

  return (
    <div className="px-4 py-5 flex flex-col gap-6">
      {/* D-day 카드 */}
      {nextSchedule ? (
        <DdayCounter
          nextScheduledDate={nextSchedule.scheduled_date}
          serviceName={
            nextSchedule.items_this_visit.map((i) => i.name).join(', ') || '청소 서비스'
          }
        />
      ) : (
        <div className="bg-gradient-to-br from-gray-100 to-gray-200 rounded-3xl p-6 text-center">
          <p className="text-gray-500 font-medium">예정된 서비스가 없습니다</p>
          <p className="text-xs text-gray-400 mt-1">담당자에게 문의해주세요.</p>
        </div>
      )}

      {/* 구독 정보 */}
      {contract && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-600 mb-3">현재 구독 정보</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 rounded-xl p-3">
              <p className="text-xs text-blue-500 mb-1">서비스 등급</p>
              <p className="text-sm font-bold text-blue-700">{contract.service_grade}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">구독 플랜</p>
              <p className="text-sm font-bold text-gray-700">
                {contract.subscription_plan
                  ? SUBSCRIPTION_PLAN_LABELS[contract.subscription_plan]
                  : '1회'}
              </p>
            </div>
            {contract.end_date && (
              <div className="col-span-2 bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1">계약 만료일</p>
                <p className="text-sm font-bold text-gray-700">
                  {format(new Date(contract.end_date), 'yyyy년 M월 d일', { locale: ko })}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 최근 완료 서비스 */}
      {completed.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900">최근 완료 서비스</h2>
            <Link href="/customer/reports" className="text-sm text-blue-600">
              전체 보기
            </Link>
          </div>
          {completed.map((s) => (
            <Link
              key={s.id}
              href={`/customer/reports/${s.id}`}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center justify-between active:scale-[0.98] transition-transform"
            >
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  {format(new Date(s.scheduled_date), 'M월 d일 (EEE)', { locale: ko })}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {s.items_this_visit.map((i) => i.name).join(', ') || '청소 서비스'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs px-2 py-1 rounded-full ${SCHEDULE_STATUS_COLORS[s.status]}`}
                >
                  {SCHEDULE_STATUS_LABELS[s.status]}
                </span>
                <span className="text-gray-300">›</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
