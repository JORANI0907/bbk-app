import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format, isPast, isToday } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ServiceSchedule } from '@/types/database'
import { SCHEDULE_STATUS_LABELS, SCHEDULE_STATUS_COLORS } from '@/lib/constants'

const CUSTOMER_TYPE_COLORS: Record<string, string> = {
  '정기딥케어': 'bg-indigo-100 text-indigo-700',
  '정기엔드케어': 'bg-sky-100 text-sky-700',
  '1회성케어': 'bg-gray-100 text-gray-600',
}

function getDday(date: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}

export default async function CustomerHomePage() {
  const session = getServerSession()
  if (!session || session.role !== 'customer') redirect('/login')

  const supabase = createServiceClient()

  const { data: userProfile } = await supabase
    .from('users')
    .select('name')
    .eq('id', session.userId)
    .single()

  const { data: rawCustomer } = await supabase
    .from('customers')
    .select('id, business_name, customer_type, status, next_visit_date')
    .eq('user_id', session.userId)
    .maybeSingle()

  const customer = rawCustomer as {
    id: string
    business_name: string
    customer_type: string | null
    status: string | null
    next_visit_date: string | null
  } | null

  // 예정 일정 조회
  const today = format(new Date(), 'yyyy-MM-dd')
  const { data: upcomingSchedules } = customer
    ? await supabase
        .from('service_schedules')
        .select('*')
        .eq('customer_id', customer.id)
        .gte('scheduled_date', today)
        .in('status', ['scheduled', 'confirmed'])
        .order('scheduled_date', { ascending: true })
        .limit(1)
    : { data: null }

  const nextSchedule = (upcomingSchedules?.[0] ?? null) as ServiceSchedule | null

  // 최근 완료 서비스 조회
  const { data: recentSchedules } = customer
    ? await supabase
        .from('service_schedules')
        .select('*')
        .eq('customer_id', customer.id)
        .eq('status', 'completed')
        .order('scheduled_date', { ascending: false })
        .limit(5)
    : { data: null }

  const completed = (recentSchedules ?? []) as ServiceSchedule[]

  const dday = nextSchedule ? getDday(nextSchedule.scheduled_date) : null
  const typeColor = customer?.customer_type ? CUSTOMER_TYPE_COLORS[customer.customer_type] : 'bg-gray-100 text-gray-600'

  return (
    <div className="px-4 py-5 flex flex-col gap-5">

      {/* 웰컴 배너 */}
      <div
        className="rounded-3xl p-5 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 60%, #60a5fa 100%)' }}
      >
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            {customer?.customer_type && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold bg-white/20 text-white`}>
                {customer.customer_type}
              </span>
            )}
          </div>
          <p className="text-white/80 text-sm mb-0.5">안녕하세요</p>
          <h1 className="text-xl font-black text-white leading-tight">
            {customer?.business_name ?? userProfile?.name ?? '고객'}님
          </h1>
          <p className="text-white/70 text-xs mt-2">BBK 공간케어를 이용해 주셔서 감사합니다.</p>
        </div>
        {/* 장식 원 */}
        <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/10" />
        <div className="absolute -right-2 -bottom-8 w-20 h-20 rounded-full bg-white/10" />
      </div>

      {/* 다음 방문 카드 */}
      {nextSchedule ? (
        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-1 flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">다음 서비스</span>
            {dday !== null && (
              <span className={`text-sm font-black ${dday === 0 ? 'text-red-500' : 'text-blue-600'}`}>
                {dday === 0 ? '오늘!' : `D-${dday}`}
              </span>
            )}
          </div>
          <div className="px-4 pb-4">
            <p className="text-lg font-bold text-gray-900 mt-1">
              {format(new Date(nextSchedule.scheduled_date), 'M월 d일 (EEE)', { locale: ko })}
            </p>
            {(nextSchedule.scheduled_time_start || nextSchedule.scheduled_time_end) && (
              <p className="text-sm text-gray-500 mt-0.5">
                {nextSchedule.scheduled_time_start}
                {nextSchedule.scheduled_time_end ? ` ~ ${nextSchedule.scheduled_time_end}` : ''}
              </p>
            )}
            {nextSchedule.items_this_visit?.length > 0 && (
              <p className="text-sm text-gray-600 mt-2 bg-gray-50 rounded-lg px-3 py-2">
                {nextSchedule.items_this_visit.map((i: { name: string }) => i.name).join(', ')}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center">
          <p className="text-sm text-gray-500 font-medium">예정된 서비스가 없습니다</p>
          <p className="text-xs text-gray-400 mt-1">담당자에게 문의해주세요.</p>
        </div>
      )}

      {/* 서비스 빠른 이동 */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { href: '/customer/schedule', icon: '📅', label: '서비스 일정' },
          { href: '/customer/requests', icon: '💬', label: '요청사항' },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col items-center gap-2 active:scale-[0.97] transition-transform shadow-sm"
          >
            <span className="text-2xl">{item.icon}</span>
            <span className="text-xs font-semibold text-gray-700">{item.label}</span>
          </Link>
        ))}
      </div>

      {/* 최근 완료 서비스 */}
      {completed.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-800">최근 완료 서비스</h2>
            <Link href="/customer/reports" className="text-xs text-blue-600 font-medium">
              전체 보기
            </Link>
          </div>
          {completed.map((s) => (
            <Link
              key={s.id}
              href={`/customer/reports/${s.id}`}
              className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-between active:scale-[0.98] transition-transform shadow-sm"
            >
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  {format(new Date(s.scheduled_date), 'M월 d일 (EEE)', { locale: ko })}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {s.items_this_visit?.map((i: { name: string }) => i.name).join(', ') || '청소 서비스'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-1 rounded-full ${SCHEDULE_STATUS_COLORS[s.status]}`}>
                  {SCHEDULE_STATUS_LABELS[s.status]}
                </span>
                <span className="text-gray-300 text-sm">›</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {!customer && (
        <div className="flex flex-col items-center justify-center py-10 gap-3 text-center bg-white rounded-2xl border border-gray-100">
          <span className="text-4xl">🏢</span>
          <p className="text-sm font-semibold text-gray-700">연결된 고객 정보가 없습니다</p>
          <p className="text-xs text-gray-400">관리자에게 문의해주세요.</p>
        </div>
      )}
    </div>
  )
}
