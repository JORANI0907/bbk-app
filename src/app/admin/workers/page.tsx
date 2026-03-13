import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { format } from 'date-fns'

export default async function WorkersPage() {
  const supabase = createClient()
  const today = format(new Date(), 'yyyy-MM-dd')

  const { data: workers } = await supabase
    .from('users')
    .select('*')
    .eq('role', 'worker')
    .order('name')

  // 오늘 배정 건수
  const workerIds = workers?.map(w => w.id) ?? []
  const { data: todaySchedules } = await supabase
    .from('service_schedules')
    .select('worker_id, status')
    .eq('scheduled_date', today)
    .in('worker_id', workerIds)

  const scheduleCountMap = (todaySchedules ?? []).reduce<Record<string, number>>((acc, s) => {
    if (s.worker_id) {
      acc[s.worker_id] = (acc[s.worker_id] ?? 0) + 1
    }
    return acc
  }, {})

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">직원 관리</h1>
        <span className="text-sm text-gray-500">총 {workers?.length ?? 0}명</span>
      </div>

      <div className="grid gap-4">
        {workers?.map(worker => (
          <Card key={worker.id} className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center font-semibold text-blue-600">
                  {worker.name[0]}
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{worker.name}</p>
                  <p className="text-sm text-gray-500">{worker.phone}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">
                  오늘 {scheduleCountMap[worker.id] ?? 0}건
                </span>
                <Badge variant={worker.is_active ? 'success' : 'default'}>
                  {worker.is_active ? '활성' : '비활성'}
                </Badge>
              </div>
            </div>
          </Card>
        ))}

        {(!workers || workers.length === 0) && (
          <div className="text-center py-12 text-gray-500">
            등록된 직원이 없습니다.
          </div>
        )}
      </div>
    </div>
  )
}
