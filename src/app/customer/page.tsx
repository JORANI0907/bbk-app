import { createServiceClient } from '@/lib/supabase/server'
import { getCustomerSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { format, addMonths } from 'date-fns'
import { NoticesSection } from '@/components/customer/NoticesSection'
import { ScheduleWithConstruction } from '@/components/customer/ScheduleCard'
import { CircularGauge } from '@/components/customer/CircularGauge'
import { ReportToggle } from '@/components/customer/ReportToggle'
import { CompletedScheduleData } from '@/components/customer/CompletedScheduleCard'
import {
  CustomerGrade,
  RecentScheduleRow,
  calcComfortIndex,
  calcOuterComfortIndex,
  calcProgressPct,
} from '@/lib/customer-indices'

const GRADE_TIER: Record<CustomerGrade, { abbr: string; year: string; activeNode: string; futureNode: string }> = {
  '화이트': {
    abbr: 'W', year: '1년차',
    activeNode: 'bg-white text-blue-700 ring-2 ring-white shadow-lg',
    futureNode: 'bg-white/12 text-white/30',
  },
  '블루': {
    abbr: 'B', year: '2년차',
    activeNode: 'bg-sky-300 text-sky-900 ring-2 ring-sky-200 shadow-lg',
    futureNode: 'bg-sky-400/15 text-white/30',
  },
  '블랙': {
    abbr: 'K', year: '3년차',
    activeNode: 'bg-gray-900 text-white ring-2 ring-gray-400 shadow-lg',
    futureNode: 'bg-gray-800/25 text-white/30',
  },
}

function GradeProgressCard({ currentGrade }: { currentGrade: CustomerGrade }) {
  const grades: CustomerGrade[] = ['화이트', '블루', '블랙']
  const currentIdx = grades.indexOf(currentGrade)

  return (
    <div className="mt-4 rounded-2xl bg-white/10 px-4 py-3.5">
      <p className="text-[9px] font-bold text-white/50 uppercase tracking-widest mb-3">고객 등급</p>
      <div className="grid grid-cols-5 items-center mb-2">
        {grades.flatMap((grade, i) => {
          const isActive = grade === currentGrade
          const isPast = i < currentIdx
          const tier = GRADE_TIER[grade]
          const circle = (
            <div key={grade} className="flex justify-center">
              <div className={`w-11 h-11 rounded-full flex items-center justify-center font-black text-sm transition-all duration-300 ${
                isActive ? `${tier.activeNode} scale-110` : isPast ? 'bg-white/30 text-white/60' : tier.futureNode
              }`}>
                {tier.abbr}
              </div>
            </div>
          )
          if (i < grades.length - 1) {
            return [circle, (
              <div key={`c${i}`} className={`h-px ${i < currentIdx ? 'bg-white/60' : 'bg-white/20'}`} />
            )]
          }
          return [circle]
        })}
      </div>
      <div className="grid grid-cols-5">
        {grades.flatMap((grade, i) => {
          const isActive = grade === currentGrade
          const tier = GRADE_TIER[grade]
          const label = (
            <div key={grade} className="flex flex-col items-center gap-0.5">
              <p className={`text-[10px] font-bold ${isActive ? 'text-white' : 'text-white/40'}`}>{grade}</p>
              <p className={`text-[9px] ${isActive ? 'text-white/65' : 'text-white/25'}`}>{tier.year}</p>
            </div>
          )
          if (i < grades.length - 1) {
            return [label, <div key={`s${i}`} />]
          }
          return [label]
        })}
      </div>
    </div>
  )
}

function getOriginalMonthlyPrice(visitCountPerMonth: number | null): number {
  if (!visitCountPerMonth || visitCountPerMonth <= 1) return 198000
  if (visitCountPerMonth === 2) return 396000
  return 594000
}

export default async function CustomerHomePage() {
  const session = getCustomerSession()
  if (!session || session.role !== 'customer') redirect('/login')

  const supabase = createServiceClient()

  const { data: userProfile } = await supabase
    .from('users')
    .select('name')
    .eq('id', session.userId)
    .single()

  const { data: rawCustomer } = await supabase
    .from('customers')
    .select('id, business_name, customer_type, status, next_visit_date, billing_cycle, billing_amount, visit_count_per_month, grade, drive_folder_url')
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
    drive_folder_url: string | null
  } | null

  const today = format(new Date(), 'yyyy-MM-dd')
  const thisMonth = today.slice(0, 7)
  const thisMonthStart = `${thisMonth}-01`
  const nextMonthStart = format(addMonths(new Date(thisMonthStart), 1), 'yyyy-MM-dd')

  const [upcomingResult, noticesResult, completedSchedulesResult, thisMonthSchedulesResult] = await Promise.all([
    customer
      ? supabase
          .from('service_schedules')
          .select('*, worker:users(id,name), application:service_applications(construction_time)')
          .eq('customer_id', customer.id)
          .gte('scheduled_date', today)
          .in('status', ['scheduled', 'confirmed'])
          .order('scheduled_date', { ascending: true })
          .limit(3)
      : Promise.resolve({ data: null }),

    supabase
      .from('notices')
      .select('id, title, content, type, priority, pinned, event_date, image_url, created_at')
      .in('target_audience', ['all', 'customer'])
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(20),

    customer
      ? supabase
          .from('service_schedules')
          .select('*, worker:users(id,name)')
          .eq('customer_id', customer.id)
          .eq('status', 'completed')
          .is('deleted_at', null)
          .order('scheduled_date', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] }),

    customer
      ? supabase
          .from('service_schedules')
          .select('id, status')
          .eq('customer_id', customer.id)
          .gte('scheduled_date', thisMonthStart)
          .lt('scheduled_date', nextMonthStart)
      : Promise.resolve({ data: null }),
  ])

  const upcomingSchedules = (upcomingResult.data ?? []) as ScheduleWithConstruction[]
  const rawCompleted = (completedSchedulesResult.data ?? []) as Array<{ id: string } & Record<string, unknown>>

  // closing_checklists는 별도 쿼리로 in-memory join (PostgREST nested embed 우회)
  const completedIds = rawCompleted.map((s) => s.id)
  const { data: closingsRaw } = completedIds.length > 0
    ? await supabase
        .from('closing_checklists')
        .select('schedule_id, condition_score, recommended_services, customer_comment')
        .in('schedule_id', completedIds)
    : { data: [] as Array<{ schedule_id: string; condition_score: number | null; recommended_services: unknown; customer_comment: string | null }> }

  const closingsBySchedule = new Map<string, { condition_score: number | null; recommended_services: unknown; customer_comment: string | null }>()
  for (const c of closingsRaw ?? []) {
    closingsBySchedule.set(c.schedule_id, {
      condition_score: c.condition_score,
      recommended_services: c.recommended_services,
      customer_comment: c.customer_comment,
    })
  }

  const completedSchedules = rawCompleted.map((s) => ({
    ...s,
    closing_checklists: closingsBySchedule.has(s.id) ? [closingsBySchedule.get(s.id)!] : [],
  })) as unknown as CompletedScheduleData[]

  type NoticeItem = {
    id: string; title: string; content: string
    type: 'notice' | 'event'; priority: 'normal' | 'high' | 'urgent'
    pinned: boolean; event_date: string | null; image_url: string | null; created_at: string
  }
  const allNotices = (noticesResult.data ?? []) as NoticeItem[]
  const noticeList = allNotices.filter(n => n.type === 'notice')
  const eventList = allNotices.filter(n => n.type === 'event')

  const recentSchedules = completedSchedules as unknown as RecentScheduleRow[]
  const monthlySchedules = (thisMonthSchedulesResult.data ?? []) as { id: string; status: string }[]

  const comfortIndex = calcComfortIndex(recentSchedules)
  const outerComfortIndex = calcOuterComfortIndex(recentSchedules)
  const progressPct = calcProgressPct(monthlySchedules)

  const comfortSampleCount = recentSchedules.filter(
    (r) => r.closing_checklists?.[0]?.condition_score != null
  ).length
  const outerSampleCount = recentSchedules.filter(
    (r) => Array.isArray(r.closing_checklists?.[0]?.recommended_services)
      && (r.closing_checklists![0].recommended_services as unknown[]).length > 0
  ).length
  const monthlyCompletedCount = monthlySchedules.filter((s) => s.status === 'completed').length

  const savingsAmount = (() => {
    if (customer?.billing_cycle !== '연간' || !customer?.billing_amount) return null
    const originalMonthly = getOriginalMonthlyPrice(customer.visit_count_per_month)
    const savings = originalMonthly * 12 - customer.billing_amount
    return savings > 0 ? savings : null
  })()

  const hasAnyGauge = comfortIndex !== null || outerComfortIndex !== null || progressPct !== null

  return (
    <div className="px-4 py-5 flex flex-col gap-5 max-w-2xl mx-auto md:px-6 md:py-8 md:gap-6">

      {/* 웰컴 배너 */}
      <div
        className="rounded-3xl p-5 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 60%, #60a5fa 100%)' }}
      >
        <div className="relative z-10">
          {customer?.customer_type && (
            <div className="mb-1">
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-white/20 text-white">
                {customer.customer_type}
              </span>
            </div>
          )}
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
          {customer?.grade && <GradeProgressCard currentGrade={customer.grade} />}

          {/* 3개 원형 게이지 */}
          {hasAnyGauge && (
            <div className="mt-4 grid grid-cols-3 gap-3">
              <CircularGauge
                pct={comfortIndex}
                displayTop={comfortIndex !== null ? `${comfortIndex}` : '-'}
                displaySub="점"
                title="쾌적 지수"
                caption={comfortSampleCount > 0 ? `최근 ${comfortSampleCount}회 기준` : '데이터 없음'}
              />
              <CircularGauge
                pct={outerComfortIndex}
                displayTop={outerComfortIndex !== null ? `${outerComfortIndex}` : '-'}
                displaySub="점"
                title="범위 외 쾌적"
                caption={outerSampleCount > 0 ? `최근 ${outerSampleCount}회 기준` : '데이터 없음'}
              />
              <CircularGauge
                pct={progressPct}
                displayTop={progressPct !== null ? `${progressPct}` : '-'}
                displaySub="%"
                title="이번달 진행률"
                caption={monthlySchedules.length > 0 ? `${monthlyCompletedCount}/${monthlySchedules.length}회` : '일정 없음'}
              />
            </div>
          )}
        </div>
        <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/10" />
        <div className="absolute -right-2 -bottom-8 w-20 h-20 rounded-full bg-white/10" />
      </div>

      {/* 관리 리포트 (예정/완료 토글) */}
      <ReportToggle
        upcomingSchedules={upcomingSchedules}
        completedSchedules={completedSchedules}
        driveFolderUrl={customer?.drive_folder_url ?? null}
      />

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
