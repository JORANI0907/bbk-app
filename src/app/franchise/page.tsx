import { redirect } from 'next/navigation'
import { format, addMonths } from 'date-fns'
import { getFranchiseSession } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase/server'
import {
  calcAllIndices,
  aggregateIndices,
  RecentScheduleRow,
  MonthlyScheduleRow,
  CustomerGrade,
} from '@/lib/customer-indices'
import { OverviewCard } from '@/components/franchise/OverviewCard'
import { BranchCard, BranchSummary } from '@/components/franchise/BranchCard'

interface AppMarkRow {
  id: string
  condition_score: number | null
  recommended_services: unknown
}

interface CompletedScheduleRow {
  id: string
  customer_id: string
  scheduled_date: string | null
  application_id: string | null
}

interface MonthlyRow {
  id: string
  customer_id: string
  status: string
}

export default async function FranchiseHomePage() {
  const session = getFranchiseSession()
  if (!session) redirect('/login')

  const supabase = createServiceClient()
  const { data: hq } = await supabase
    .from('franchise_hq')
    .select('id')
    .eq('user_id', session.userId)
    .single()

  if (!hq) redirect('/login')

  const { data: mappings } = await supabase
    .from('franchise_branch_map')
    .select('customer_id, display_order')
    .eq('franchise_hq_id', hq.id)
    .order('display_order', { ascending: true })

  const customerIds = (mappings ?? []).map((m) => m.customer_id)

  if (customerIds.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <OverviewCard
          branchCount={0}
          indices={{ comfortIndex: null, outerComfortIndex: null, progressPct: null }}
        />
        <div className="bg-surface border border-border-subtle rounded-2xl p-8 text-center">
          <p className="text-sm font-semibold text-text-primary">연결된 지점이 없습니다</p>
          <p className="text-xs text-text-tertiary mt-1.5 break-keep">
            지점 등록은 BBK 관리자에게 문의해주세요.
          </p>
        </div>
      </div>
    )
  }

  const today = format(new Date(), 'yyyy-MM-dd')
  const thisMonth = today.slice(0, 7)
  const thisMonthStart = `${thisMonth}-01`
  const nextMonthStart = format(addMonths(new Date(thisMonthStart), 1), 'yyyy-MM-dd')

  // 매핑된 지점의 기본 정보 + 완료 일정 + 이번달 일정 동시 조회
  const [customersResult, completedResult, monthlyResult] = await Promise.all([
    supabase
      .from('customers')
      .select('id, business_name, address, grade, next_visit_date')
      .in('id', customerIds)
      .is('deleted_at', null),

    supabase
      .from('service_schedules')
      .select('id, customer_id, scheduled_date, application_id')
      .in('customer_id', customerIds)
      .eq('status', 'completed')
      .is('deleted_at', null)
      .order('scheduled_date', { ascending: false }),

    supabase
      .from('service_schedules')
      .select('id, customer_id, status')
      .in('customer_id', customerIds)
      .gte('scheduled_date', thisMonthStart)
      .lt('scheduled_date', nextMonthStart),
  ])

  const customers = customersResult.data ?? []
  const completedRows = (completedResult.data ?? []) as CompletedScheduleRow[]
  const monthlyRows = (monthlyResult.data ?? []) as MonthlyRow[]

  // 마감 데이터는 service_applications에 저장됨 (closing_checklists 테이블은 비어있음)
  // service_schedules.application_id로 연결
  const applicationIds = completedRows
    .map((s) => s.application_id)
    .filter((id): id is string => !!id)

  const { data: appsRaw } = applicationIds.length > 0
    ? await supabase
        .from('service_applications')
        .select('id, condition_score, recommended_services')
        .in('id', applicationIds)
    : { data: [] as AppMarkRow[] }

  const appsById = new Map<string, AppMarkRow>()
  for (const a of (appsRaw ?? []) as AppMarkRow[]) {
    appsById.set(a.id, a)
  }

  // 지점별 최근 5개 완료 일정 + service_applications 마감 데이터 in-memory join
  const recentByCustomer = new Map<string, RecentScheduleRow[]>()
  for (const row of completedRows) {
    const list = recentByCustomer.get(row.customer_id) ?? []
    if (list.length < 5) {
      const app = row.application_id ? appsById.get(row.application_id) : undefined
      list.push({
        id: row.id,
        scheduled_date: row.scheduled_date,
        closing_checklists: app
          ? [{
              condition_score: app.condition_score,
              recommended_services: app.recommended_services,
              customer_comment: null,
            }]
          : [],
      })
      recentByCustomer.set(row.customer_id, list)
    }
  }

  // 지점별 이번달 일정
  const monthlyByCustomer = new Map<string, MonthlyScheduleRow[]>()
  for (const row of monthlyRows) {
    const list = monthlyByCustomer.get(row.customer_id) ?? []
    list.push({ id: row.id, status: row.status })
    monthlyByCustomer.set(row.customer_id, list)
  }

  // 매핑 순서대로 정렬된 지점 카드 데이터 생성
  const customerById = new Map(customers.map((c) => [c.id, c]))
  const branches: BranchSummary[] = customerIds
    .map((cid): BranchSummary | null => {
      const c = customerById.get(cid)
      if (!c) return null
      return {
        customerId: c.id,
        businessName: c.business_name,
        address: c.address,
        grade: (c.grade ?? null) as CustomerGrade | null,
        nextVisitDate: c.next_visit_date,
        indices: calcAllIndices(
          recentByCustomer.get(c.id) ?? [],
          monthlyByCustomer.get(c.id) ?? []
        ),
      }
    })
    .filter((b): b is BranchSummary => b !== null)

  const overviewIndices = aggregateIndices(branches.map((b) => b.indices))

  return (
    <div className="flex flex-col gap-6">
      <OverviewCard branchCount={branches.length} indices={overviewIndices} />

      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-brand-600 uppercase tracking-widest">
            지점 현황
          </p>
          <span className="text-xs text-text-tertiary font-semibold">
            {branches.length}개 지점
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {branches.map((branch) => (
            <BranchCard key={branch.customerId} branch={branch} />
          ))}
        </div>
      </div>
    </div>
  )
}
