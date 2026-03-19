import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/admin/payroll?month=YYYY-MM
// Returns all payroll data for month grouped by person
export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month')

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month 파라미터가 필요합니다. (YYYY-MM)' }, { status: 400 })
  }

  const [appsRes, assignmentsRes, usersRes, workersRes, recordsRes, customersRes] = await Promise.all([
    // 담당자 배정 서비스
    supabase
      .from('service_applications')
      .select('id, assigned_to, business_name, service_type, construction_date, manager_pay, unit_price_per_visit')
      .not('assigned_to', 'is', null)
      .gte('construction_date', `${month}-01`)
      .lte('construction_date', `${month}-31`)
      .order('construction_date'),

    // 작업자 배정
    supabase
      .from('work_assignments')
      .select('id, worker_id, business_name, construction_date, salary, application_id')
      .gte('construction_date', `${month}-01`)
      .lte('construction_date', `${month}-31`)
      .order('construction_date'),

    // 담당자 목록 (users 테이블의 worker/admin)
    supabase
      .from('users')
      .select('id, name, role, phone')
      .in('role', ['worker', 'admin'])
      .eq('is_active', true)
      .order('name'),

    // 작업자 목록 (workers 테이블)
    supabase
      .from('workers')
      .select('id, name, employment_type, day_wage, night_wage, avg_salary, phone')
      .order('name'),

    // 기존 급여 정산 기록
    supabase
      .from('payroll_records')
      .select('*')
      .eq('year_month', month),

    // 고객 건당급여 (unit_price_per_visit 폴백용)
    supabase
      .from('customers')
      .select('business_name, unit_price')
      .not('unit_price', 'is', null),
  ])

  if (appsRes.error) return NextResponse.json({ error: appsRes.error.message }, { status: 500 })
  if (assignmentsRes.error) return NextResponse.json({ error: assignmentsRes.error.message }, { status: 500 })
  if (usersRes.error) return NextResponse.json({ error: usersRes.error.message }, { status: 500 })
  if (workersRes.error) return NextResponse.json({ error: workersRes.error.message }, { status: 500 })
  if (recordsRes.error) return NextResponse.json({ error: recordsRes.error.message }, { status: 500 })

  const apps = appsRes.data ?? []
  const assignments = assignmentsRes.data ?? []
  const users = usersRes.data ?? []
  const workers = workersRes.data ?? []
  const records = recordsRes.data ?? []
  // 업체명 → 고객 건당급여 맵 (unit_price_per_visit 미설정 시 폴백)
  const customerUnitPriceMap = new Map<string, number>(
    (customersRes.data ?? [])
      .filter(c => c.unit_price != null)
      .map(c => [c.business_name, c.unit_price as number])
  )

  const recordMap = new Map(records.map(r => [`${r.person_type}:${r.person_id}`, r]))

  type AppWithResolved = typeof apps[number] & { resolved_pay: number }

  // 담당자 급여 집계
  const managerMap = new Map<string, {
    person: typeof users[number],
    jobs: AppWithResolved[],
    auto_amount: number,
    record: typeof records[number] | undefined,
  }>()

  for (const app of apps) {
    if (!app.assigned_to) continue
    const user = users.find(u => u.id === app.assigned_to)
    if (!user) continue

    if (!managerMap.has(app.assigned_to)) {
      managerMap.set(app.assigned_to, {
        person: user,
        jobs: [],
        auto_amount: 0,
        record: recordMap.get(`user:${app.assigned_to}`),
      })
    }
    const entry = managerMap.get(app.assigned_to)!

    // 건당 급여: manager_pay > unit_price_per_visit > 고객DB unit_price(폴백) 순
    const fallbackUnitPrice = app.service_type === '정기엔드케어'
      ? (customerUnitPriceMap.get(app.business_name) ?? 0)
      : 0
    const payPerJob = app.manager_pay
      ?? app.unit_price_per_visit
      ?? fallbackUnitPrice

    // resolved_pay를 job에 포함시켜 프론트에서 "미설정" 없이 표시
    entry.jobs.push({ ...app, resolved_pay: payPerJob })
    entry.auto_amount += payPerJob
  }

  // 작업자 급여 집계
  const workerMap = new Map<string, {
    person: typeof workers[number],
    jobs: typeof assignments,
    auto_amount: number,
    record: typeof records[number] | undefined,
  }>()

  for (const assign of assignments) {
    if (!assign.worker_id) continue
    const worker = workers.find(w => w.id === assign.worker_id)
    if (!worker) continue

    if (!workerMap.has(assign.worker_id)) {
      workerMap.set(assign.worker_id, {
        person: worker,
        jobs: [],
        auto_amount: 0,
        record: recordMap.get(`worker:${assign.worker_id}`),
      })
    }
    const entry = workerMap.get(assign.worker_id)!
    entry.jobs.push(assign)
    entry.auto_amount += assign.salary ?? 0
  }

  return NextResponse.json({
    managers: Array.from(managerMap.values()),
    workers_payroll: Array.from(workerMap.values()),
  })
}

// PATCH /api/admin/payroll
// Upsert a payroll_record for final adjustment and payment tracking
export async function PATCH(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()
  const { year_month, person_type, person_id, auto_amount, final_amount, note, is_paid } = body

  if (!year_month || !person_type || !person_id) {
    return NextResponse.json({ error: 'year_month, person_type, person_id가 필요합니다.' }, { status: 400 })
  }
  if (!['user', 'worker'].includes(person_type)) {
    return NextResponse.json({ error: 'person_type은 user 또는 worker이어야 합니다.' }, { status: 400 })
  }

  const upsertData: Record<string, unknown> = {
    year_month,
    person_type,
    person_id,
  }
  if (auto_amount !== undefined) upsertData.auto_amount = auto_amount
  if (final_amount !== undefined) upsertData.final_amount = final_amount === '' ? null : final_amount
  if (note !== undefined) upsertData.note = note
  if (is_paid !== undefined) {
    upsertData.is_paid = is_paid
    upsertData.paid_at = is_paid ? new Date().toISOString() : null
  }

  const { data, error } = await supabase
    .from('payroll_records')
    .upsert(upsertData, { onConflict: 'year_month,person_type,person_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ record: data })
}

// PATCH /api/admin/payroll for manager_pay per job
// We reuse the applications PATCH endpoint for manager_pay updates
// This endpoint handles payroll_record upserts only
