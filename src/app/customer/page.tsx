import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ServiceSchedule } from '@/types/database'
import { NoticesSection } from '@/components/customer/NoticesSection'

type CustomerGrade = '화이트' | '블루' | '블랙'

const CUSTOMER_TYPE_COLORS: Record<string, string> = {
  '정기딥케어': 'bg-indigo-100 text-indigo-700',
  '정기엔드케어': 'bg-sky-100 text-sky-700',
  '1회성케어': 'bg-surface-sunken text-text-secondary',
}

const GRADE_BADGE: Record<CustomerGrade, string> = {
  '화이트': 'bg-white/30 text-white',
  '블루': 'bg-blue-300/40 text-white',
  '블랙': 'bg-gray-900/40 text-white',
}

// 오리지널 월 단가 (방문 횟수별)
function getOriginalMonthlyPrice(visitCountPerMonth: number | null): number {
  if (!visitCountPerMonth || visitCountPerMonth <= 1) return 198000
  if (visitCountPerMonth === 2) return 396000
  return 594000
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
    .select('id, business_name, customer_type, status, next_visit_date, billing_cycle, billing_amount, visit_count_per_month, grade')
    .eq('user_id', session.userId)
    .maybeSingle()

  const customer = rawCustomer as {
    id: string
    business_name: string
    customer_type: string | null
    status: string | null
    next_visit_date: string | null
    billing_cycle: string | null
    billing_amount: number | null
    visit_count_per_month: number | null
    grade: CustomerGrade | null
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

  // 공지·이벤트 조회 (limit 20, 5개 제한 없이 전달)
  const { data: noticesRaw } = await supabase
    .from('notices')
    .select('id, title, content, type, priority, pinned, event_date, image_url, created_at')
    .in('target_audience', ['all', 'customer'])
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(20)

  type NoticeItem = {
    id: string; title: string; content: string
    type: 'notice' | 'event'; priority: 'normal' | 'high' | 'urgent'
    pinned: boolean; event_date: string | null; image_url: string | null; created_at: string
  }
  const allNotices = (noticesRaw ?? []) as NoticeItem[]
  const noticeList = allNotices.filter(n => n.type === 'notice')
  const eventList = allNotices.filter(n => n.type === 'event')

  const dday = nextSchedule ? getDday(nextSchedule.scheduled_date) : null
  const typeColor = customer?.customer_type
    ? (CUSTOMER_TYPE_COLORS[customer.customer_type] ?? 'bg-surface-sunken text-text-secondary')
    : 'bg-surface-sunken text-text-secondary'

  // 절약 금액 계산 (연간 결제인 경우만)
  const savingsAmount = (() => {
    if (
      customer?.billing_cycle !== '연간' ||
      !customer?.billing_amount
    ) return null

    const originalMonthly = getOriginalMonthlyPrice(customer.visit_count_per_month)
    const originalAnnual = originalMonthly * 12
    const savings = originalAnnual - customer.billing_amount
    return savings > 0 ? savings : null
  })()

  return (
    <div className="px-4 py-5 flex flex-col gap-5 max-w-2xl mx-auto md:px-6 md:py-8 md:gap-6">

      {/* 웰컴 배너 */}
      <div
        className="rounded-3xl p-5 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 60%, #60a5fa 100%)' }}
      >
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {customer?.customer_type && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold bg-white/20 text-white`}>
                {customer.customer_type}
              </span>
            )}
            {customer?.grade && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${GRADE_BADGE[customer.grade]}`}>
                {customer.grade}
              </span>
            )}
          </div>
          <p className="text-white/80 text-sm mb-0.5">안녕하세요</p>
          <h1 className="text-xl font-black text-white leading-tight">
            {customer?.business_name ?? userProfile?.name ?? '고객'}님
          </h1>
          {savingsAmount !== null && (
            <p className="text-white/90 text-xs mt-1.5 font-semibold">
              연간 {savingsAmount.toLocaleString()}원 절약 중
            </p>
          )}
          <p className="text-white/70 text-xs mt-1.5">BBK 공간케어를 이용해 주셔서 감사합니다.</p>
        </div>
        {/* 장식 원 */}
        <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/10" />
        <div className="absolute -right-2 -bottom-8 w-20 h-20 rounded-full bg-white/10" />
      </div>

      {/* 다음 방문 카드 */}
      {nextSchedule ? (
        <div className="bg-surface rounded-2xl border border-brand-100 shadow-soft overflow-hidden">
          <div className="px-4 pt-4 pb-1 flex items-center justify-between">
            <span className="text-xs font-semibold text-brand-600 uppercase tracking-wide">다음 서비스</span>
            {dday !== null && (
              <span className={`text-sm font-black ${dday === 0 ? 'text-state-danger' : 'text-brand-600'}`}>
                {dday === 0 ? '오늘!' : `D-${dday}`}
              </span>
            )}
          </div>
          <div className="px-4 pb-4">
            <p className="text-lg font-bold text-text-primary mt-1">
              {format(new Date(nextSchedule.scheduled_date), 'M월 d일 (EEE)', { locale: ko })}
            </p>
            {(nextSchedule.scheduled_time_start || nextSchedule.scheduled_time_end) && (
              <p className="text-sm text-text-secondary mt-0.5">
                {nextSchedule.scheduled_time_start}
                {nextSchedule.scheduled_time_end ? ` ~ ${nextSchedule.scheduled_time_end}` : ''}
              </p>
            )}
            {nextSchedule.items_this_visit?.length > 0 && (
              <p className="text-sm text-text-secondary mt-2 bg-surface-sunken rounded-lg px-3 py-2">
                {nextSchedule.items_this_visit.map((i: { name: string }) => i.name).join(', ')}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-border-subtle p-5 text-center">
          <p className="text-sm text-text-secondary font-medium">예정된 서비스가 없습니다</p>
          <p className="text-xs text-text-tertiary mt-1">담당자에게 문의해주세요.</p>
        </div>
      )}

      {/* 공지 & 이벤트 */}
      <NoticesSection notices={noticeList} events={eventList} />

      {!customer && (
        <div className="flex flex-col items-center justify-center py-10 gap-3 text-center bg-surface rounded-2xl border border-border-subtle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 text-text-tertiary">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          <p className="text-sm font-semibold text-text-primary">연결된 고객 정보가 없습니다</p>
          <p className="text-xs text-text-tertiary">관리자에게 문의해주세요.</p>
        </div>
      )}
    </div>
  )
}
