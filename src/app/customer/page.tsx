import { createServiceClient } from '@/lib/supabase/server'
import { getCustomerSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { NoticesSection } from '@/components/customer/NoticesSection'
import { ScheduleCard, ScheduleWithConstruction } from '@/components/customer/ScheduleCard'

type CustomerGrade = '화이트' | '블루' | '블랙'

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

const CONDITION_SCORE_POINTS: Record<number, number> = { 1: 100, 2: 80, 3: 50 }
const PRIORITY_POINTS: Record<string, number> = { high: 30, medium: 40, low: 50 }

const CONDITION_META: Record<number, { label: string; text: string; bg: string; border: string; dot: string }> = {
  1: { label: '양호', text: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200', dot: 'bg-green-500' },
  2: { label: '주의', text: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200', dot: 'bg-yellow-500' },
  3: { label: '불량', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-500' },
}

const PRIORITY_CHIP: Record<string, { label: string; chip: string }> = {
  high: { label: '불량', chip: 'bg-red-50 text-red-700 border-red-200' },
  medium: { label: '주의', chip: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  low: { label: '관심', chip: 'bg-surface-sunken text-text-secondary border-border' },
}

type RecommendedServiceRaw = { name: string; reason?: string; priority: string }

interface RecentReport {
  id: string
  construction_date: string | null
  condition_score: number | null
  recommended_services: unknown
  customer_memo: string | null
  drive_folder_url: string | null
  notification_sent_at: string | null
}

function formatDateKo(dateStr: string | null): string {
  if (!dateStr) return '날짜 미정'
  const [, m, d] = dateStr.slice(0, 10).split('-')
  return `${parseInt(m, 10)}월 ${parseInt(d, 10)}일`
}

function gaugeStrokeColor(pct: number | null): string {
  if (pct === null) return '#94a3b8'
  if (pct >= 85) return '#34d399'
  if (pct >= 65) return '#fbbf24'
  return '#f87171'
}

function CircularGauge({
  pct,
  displayTop,
  displaySub,
  title,
}: {
  pct: number | null
  displayTop: string
  displaySub: string
  title: string
}) {
  const S = 72
  const sw = 7
  const r = (S - sw) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - (pct ?? 0) / 100)
  const color = gaugeStrokeColor(pct)
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: S, height: S }}>
        <svg
          width={S}
          height={S}
          style={{ transform: 'rotate(-90deg)', display: 'block' }}
        >
          <circle
            cx={S / 2}
            cy={S / 2}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth={sw}
          />
          <circle
            cx={S / 2}
            cy={S / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={`${circ}`}
            strokeDashoffset={`${offset}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-base font-black text-white leading-none">{displayTop}</span>
          <span className="text-[9px] text-white/70 leading-none mt-0.5">{displaySub}</span>
        </div>
      </div>
      <p className="text-[9px] font-semibold text-white/70 text-center leading-tight break-keep">{title}</p>
    </div>
  )
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

  const today = format(new Date(), 'yyyy-MM-dd')
  const thisMonth = today.slice(0, 7)

  const [upcomingResult, noticesResult, recentReportsResult, thisMonthSchedulesResult] = await Promise.all([
    customer
      ? supabase
          .from('service_schedules')
          .select('*, worker:users(id,name), application:service_applications(construction_time)')
          .eq('customer_id', customer.id)
          .gte('scheduled_date', today)
          .in('status', ['scheduled', 'confirmed'])
          .order('scheduled_date', { ascending: true })
          .limit(1)
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
          .from('service_applications')
          .select('id, construction_date, condition_score, recommended_services, customer_memo, drive_folder_url, notification_sent_at')
          .eq('customer_id', customer.id)
          .not('notification_sent_at', 'is', null)
          .order('notification_sent_at', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: null }),

    customer
      ? supabase
          .from('service_schedules')
          .select('id, status')
          .eq('customer_id', customer.id)
          .like('scheduled_date', `${thisMonth}%`)
      : Promise.resolve({ data: null }),
  ])

  const nextSchedule = (upcomingResult.data?.[0] ?? null) as ScheduleWithConstruction | null

  type NoticeItem = {
    id: string; title: string; content: string
    type: 'notice' | 'event'; priority: 'normal' | 'high' | 'urgent'
    pinned: boolean; event_date: string | null; image_url: string | null; created_at: string
  }
  const allNotices = (noticesResult.data ?? []) as NoticeItem[]
  const noticeList = allNotices.filter(n => n.type === 'notice')
  const eventList = allNotices.filter(n => n.type === 'event')

  const recentReports = (recentReportsResult.data ?? []) as RecentReport[]

  // 쾌적 지수: 최근 5개 리포트 condition_score 가중 평균
  const comfortIndex = (() => {
    const scores = recentReports
      .filter(r => r.condition_score !== null)
      .map(r => CONDITION_SCORE_POINTS[r.condition_score!] ?? 0)
    if (scores.length === 0) return null
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
  })()

  // 범위 외 쾌적 지수: recommended_services priority 평균 (30–50 → 0–100 정규화)
  const outerComfortIndex = (() => {
    const points = recentReports.flatMap(r => {
      if (!Array.isArray(r.recommended_services)) return []
      return (r.recommended_services as RecommendedServiceRaw[]).map(s => PRIORITY_POINTS[s.priority] ?? 40)
    })
    if (points.length === 0) return null
    const avgRaw = points.reduce((a, b) => a + b, 0) / points.length
    return Math.round((avgRaw - 30) / 20 * 100)
  })()

  // 이번달 진행률: completed / total * 100
  const progressPct = (() => {
    const schedules = (thisMonthSchedulesResult.data ?? []) as { id: string; status: string }[]
    if (schedules.length === 0) return null
    const completed = schedules.filter(s => s.status === 'completed').length
    return Math.round(completed / schedules.length * 100)
  })()

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
              />
              <CircularGauge
                pct={outerComfortIndex}
                displayTop={outerComfortIndex !== null ? `${outerComfortIndex}` : '-'}
                displaySub="점"
                title="범위 외 쾌적"
              />
              <CircularGauge
                pct={progressPct}
                displayTop={progressPct !== null ? `${progressPct}` : '-'}
                displaySub="%"
                title="이번달 진행률"
              />
            </div>
          )}
        </div>
        <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/10" />
        <div className="absolute -right-2 -bottom-8 w-20 h-20 rounded-full bg-white/10" />
      </div>

      {/* 최근 관리 리포트 */}
      {recentReports.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-brand-600 uppercase tracking-wide">최근 관리 리포트</p>
            <Link href="/customer/reports" className="text-xs text-text-tertiary hover:text-text-secondary">
              전체보기
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {recentReports.map(report => {
              const cond = report.condition_score !== null
                ? CONDITION_META[report.condition_score]
                : null
              const recs = Array.isArray(report.recommended_services)
                ? (report.recommended_services as RecommendedServiceRaw[])
                : []
              return (
                <div
                  key={report.id}
                  className="rounded-2xl border border-border-subtle bg-surface shadow-soft p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-text-primary">
                      {formatDateKo(report.construction_date)} 관리
                    </p>
                    {cond ? (
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cond.bg} ${cond.border} ${cond.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cond.dot}`} />
                        {cond.label}
                      </span>
                    ) : (
                      <span className="text-[11px] text-text-tertiary">상태 미입력</span>
                    )}
                  </div>
                  {recs.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {recs.slice(0, 3).map(rec => {
                        const meta = PRIORITY_CHIP[rec.priority]
                        return (
                          <span
                            key={rec.name}
                            className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${meta?.chip ?? 'bg-surface-sunken text-text-secondary border-border'}`}
                          >
                            {rec.name}
                          </span>
                        )
                      })}
                      {recs.length > 3 && (
                        <span className="text-[10px] text-text-tertiary self-center">+{recs.length - 3}</span>
                      )}
                    </div>
                  )}
                  {report.customer_memo && (
                    <p className="mt-1.5 text-xs text-text-secondary leading-relaxed break-keep line-clamp-2">
                      {report.customer_memo}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 다음 방문 카드 */}
      <div>
        <p className="text-xs font-semibold text-brand-600 uppercase tracking-wide mb-2">다음 서비스</p>
        {nextSchedule ? (
          <Link href={`/customer/schedule/${nextSchedule.id}`} className="block">
            <ScheduleCard
              schedule={nextSchedule}
              workerName={(nextSchedule.worker as { name?: string } | null)?.name}
            />
          </Link>
        ) : (
          <div className="bg-surface rounded-2xl border border-border-subtle p-5 text-center">
            <p className="text-sm text-text-secondary font-medium">예정된 서비스가 없습니다</p>
            <p className="text-xs text-text-tertiary mt-1">담당자에게 문의해주세요.</p>
          </div>
        )}
      </div>

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
