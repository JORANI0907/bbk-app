import { createClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { DashboardStats } from '@/components/admin/DashboardStats'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { ServiceSchedule, ScheduleStatus } from '@/types/database'
import { SCHEDULE_STATUS_LABELS } from '@/lib/constants'

function getStatusBadgeVariant(status: ScheduleStatus): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  const map: Record<ScheduleStatus, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
    scheduled: 'default',
    confirmed: 'info',
    in_progress: 'warning',
    completed: 'success',
    cancelled: 'danger',
    rescheduled: 'warning',
  }
  return map[status] ?? 'default'
}

export default async function AdminDashboardPage() {
  const session = getServerSession()
  if (session?.role === 'worker') redirect('/admin/schedule')

  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]

  // 이번 주 범위 계산
  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - now.getDay() + 1)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  const weekStartStr = weekStart.toISOString().split('T')[0]
  const weekEndStr = weekEnd.toISOString().split('T')[0]

  // 오늘 일정 전체 조회
  const { data: todaySchedules } = await supabase
    .from('service_schedules')
    .select('id, status, worker_id')
    .eq('scheduled_date', today)

  const todayScheduled = todaySchedules?.length ?? 0
  const inProgress = todaySchedules?.filter((s) => s.status === 'in_progress').length ?? 0
  const completed = todaySchedules?.filter((s) => s.status === 'completed').length ?? 0
  const unassigned = todaySchedules?.filter((s) => s.worker_id === null).length ?? 0

  // 최근 완료된 서비스 (최대 5개)
  const { data: recentCompleted } = await supabase
    .from('service_schedules')
    .select(`
      id, scheduled_date, scheduled_time_start, status, actual_completion,
      customer:customers(business_name, contact_name),
      worker:users(name)
    `)
    .eq('status', 'completed')
    .order('actual_completion', { ascending: false })
    .limit(5)

  // 이번 주 미배정 일정
  const { data: unassignedSchedules } = await supabase
    .from('service_schedules')
    .select(`
      id, scheduled_date, scheduled_time_start, status,
      customer:customers(business_name, address)
    `)
    .is('worker_id', null)
    .gte('scheduled_date', weekStartStr)
    .lte('scheduled_date', weekEndStr)
    .neq('status', 'cancelled')
    .order('scheduled_date', { ascending: true })
    .limit(10)

  const stats = { todayScheduled, inProgress, completed, unassigned }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
        <p className="text-sm text-gray-500 mt-1">
          {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
        </p>
      </div>

      {/* 통계 카드 */}
      <DashboardStats stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 최근 완료된 서비스 */}
        <Card className="p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">최근 완료 서비스</h2>
          {recentCompleted && recentCompleted.length > 0 ? (
            <ul className="space-y-3">
              {recentCompleted.map((schedule) => {
                const s = schedule as unknown as ServiceSchedule & {
                  customer: { business_name: string; contact_name: string } | null
                  worker: { name: string } | null
                }
                return (
                  <li key={s.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {s.customer?.business_name ?? '(고객 없음)'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {s.scheduled_date} · {s.worker?.name ?? '미배정'}
                      </p>
                    </div>
                    <Badge variant="success">완료</Badge>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-gray-400 py-4 text-center">완료된 서비스가 없습니다.</p>
          )}
        </Card>

        {/* 이번 주 미배정 일정 */}
        <Card className="p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">이번 주 미배정 일정</h2>
          {unassignedSchedules && unassignedSchedules.length > 0 ? (
            <ul className="space-y-3">
              {unassignedSchedules.map((schedule) => {
                const s = schedule as unknown as ServiceSchedule & {
                  customer: { business_name: string; address: string } | null
                }
                return (
                  <li key={s.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {s.customer?.business_name ?? '(고객 없음)'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {s.scheduled_date} {s.scheduled_time_start}
                      </p>
                    </div>
                    <Badge variant={getStatusBadgeVariant(s.status)}>
                      {SCHEDULE_STATUS_LABELS[s.status]}
                    </Badge>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-gray-400 py-4 text-center">미배정 일정이 없습니다.</p>
          )}
        </Card>
      </div>
    </div>
  )
}
