import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

export async function GET(request: NextRequest) {
  const session = getServerSession()
  if (!session || session.role !== 'admin')
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month') // YYYY-MM

  if (!month || !/^\d{4}-\d{2}$/.test(month))
    return NextResponse.json({ error: '월 형식이 잘못되었습니다. (YYYY-MM)' }, { status: 400 })

  const [year, mon] = month.split('-').map(Number)
  const startDate = `${month}-01`
  const nextYear = mon === 12 ? year + 1 : year
  const nextMon = mon === 12 ? 1 : mon + 1
  const endDate = `${nextYear}-${String(nextMon).padStart(2, '0')}-01`

  const supabase = createServiceClient()

  // 해당 월 서비스 신청 조회
  const { data: applications, error: appError } = await supabase
    .from('service_applications')
    .select('id, service_type, price, status, created_at, customer_name')
    .gte('created_at', `${startDate}T00:00:00.000Z`)
    .lt('created_at', `${endDate}T00:00:00.000Z`)

  if (appError) return NextResponse.json({ error: appError.message }, { status: 500 })

  // 해당 월 출퇴근 기록 조회 (직원별 집계용)
  const { data: attendance, error: attError } = await supabase
    .from('attendance')
    .select('worker_id, worker_name, work_date, clock_in, clock_out')
    .gte('work_date', startDate)
    .lt('work_date', endDate)

  if (attError) return NextResponse.json({ error: attError.message }, { status: 500 })

  const apps = applications ?? []
  const attRecords = attendance ?? []

  // 매출 집계 (완료 상태만)
  const completedApps = apps.filter(a => a.status === 'completed' || a.status === 'active')
  const revenueTotal = completedApps.reduce((sum, a) => sum + (Number(a.price) || 0), 0)
  const jobCount = apps.length

  // 서비스 타입별 현황
  const byServiceType: Record<string, { count: number; revenue: number }> = {}
  for (const app of apps) {
    const key = app.service_type ?? '미분류'
    if (!byServiceType[key]) byServiceType[key] = { count: 0, revenue: 0 }
    byServiceType[key].count += 1
    byServiceType[key].revenue += Number(app.price) || 0
  }

  // 직원별 작업 현황 (출퇴근 기록 기반)
  const workerMap: Record<string, { worker_id: string; worker_name: string; days: number; total_minutes: number }> = {}
  for (const rec of attRecords) {
    const key = rec.worker_id ?? rec.worker_name
    if (!workerMap[key]) {
      workerMap[key] = {
        worker_id: rec.worker_id ?? '',
        worker_name: rec.worker_name ?? '알 수 없음',
        days: 0,
        total_minutes: 0,
      }
    }
    workerMap[key].days += 1
    if (rec.clock_in && rec.clock_out) {
      const inMs = new Date(rec.clock_in).getTime()
      const outMs = new Date(rec.clock_out).getTime()
      const mins = Math.round((outMs - inMs) / 60000)
      if (mins > 0) workerMap[key].total_minutes += mins
    }
  }

  const byWorker = Object.values(workerMap).sort((a, b) => b.days - a.days)

  return NextResponse.json({
    month,
    revenue_total: revenueTotal,
    job_count: jobCount,
    new_customers: apps.length,
    avg_price: jobCount > 0 ? Math.round(revenueTotal / jobCount) : 0,
    by_service_type: byServiceType,
    by_worker: byWorker,
  })
}
