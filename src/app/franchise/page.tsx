import { redirect } from 'next/navigation'
import { format } from 'date-fns'
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

  // 매핑된 지점(customer) 목록
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

  // 지점 기본 정보
  const { data: customers } = await supabase
    .from('customers')
    .select('id, business_name, address, grade, next_visit_date')
    .in('id', customerIds)
    .is('deleted_at', null)

  const today = format(new Date(), 'yyyy-MM-dd')
  const thisMonth = today.slice(0, 7)

  // 각 지점별 최근 5개 완료 일정 (지수 계산용)
  const { data: recentSchedules } = await supabase
    .from('service_schedules')
    .select('id, customer_id, scheduled_date, closing_checklists(condition_score, recommended_services, customer_comment)')
    .in('customer_id', customerIds)
    .eq('status', 'completed')
    .is('deleted_at', null)
    .order('scheduled_date', { ascending: false })

  // 이번달 일정 (진행률 계산용)
  const { data: monthlySchedules } = await supabase
    .from('service_schedules')
    .select('id, customer_id, status')
    .in('customer_id', customerIds)
    .like('scheduled_date', `${thisMonth}%`)

  // 지점별 그룹화 → 지수 계산
  const recentByCustomer = new Map<string, RecentScheduleRow[]>()
  for (const row of (recentSchedules ?? []) as Array<RecentScheduleRow & { customer_id: string }>) {
    const list = recentByCustomer.get(row.customer_id) ?? []
    if (list.length < 5) {
      list.push(row)
      recentByCustomer.set(row.customer_id, list)
    }
  }

  const monthlyByCustomer = new Map<string, MonthlyScheduleRow[]>()
  for (const row of (monthlySchedules ?? []) as Array<MonthlyScheduleRow & { customer_id: string }>) {
    const list = monthlyByCustomer.get(row.customer_id) ?? []
    list.push(row)
    monthlyByCustomer.set(row.customer_id, list)
  }

  // 매핑 순서대로 정렬된 지점 카드 데이터 생성
  const customerById = new Map((customers ?? []).map((c) => [c.id, c]))
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
