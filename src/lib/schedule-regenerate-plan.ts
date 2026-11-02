/**
 * 정기 고객 회차 생성·수정 반영 계획 (2026-11-03)
 *
 * generate-schedules 라우트가 실제로 쓰기 전에 "무엇이 바뀌는지"를 계산한다.
 *   - 미리보기(dry_run): 관리자에게 신규/변경/삭제/유지 목록을 보여준다
 *   - 실제 반영: 같은 계획으로 변경 건수를 세어 결과 메시지에 쓴다
 * 회차별 담당자·작업자 결정(pickAssignment)도 여기서 한 번만 정의한다.
 */

import { createServiceClient } from '@/lib/supabase/server'

type Supabase = ReturnType<typeof createServiceClient>

export type AssignmentMap = Record<string, { user_id: string | null; worker_ids: string[] }> | null

/** 회차 담당자·작업자 결정에 필요한 고객 마스터 필드 */
export interface AssignmentSource {
  id: string
  business_name: string
  visit_cycle_unit: string | null
  assigned_user_id: string | null
  assigned_worker_id: string | null
  weekday_assignments: AssignmentMap
  monthly_date_assignments: AssignmentMap
}

export interface Assignment {
  assigned_to: string | null
  worker_ids: string[]
}

// Phase 38/39: 회차 하나의 담당자·작업자 결정.
// 정책 (하단 우선): visit_cycle_unit 별로 다른 매핑을 참조.
//   - unit=week : weekday_assignments (요일 키 0~6) 에 하나라도 있으면 그 매핑만 사용
//   - unit=month: monthly_date_assignments (일자 키 1~31) 에 하나라도 있으면 그 매핑만 사용
//   - unit=day / 매핑 전체 비어있음: customer.assigned_user_id / assigned_worker_id 사용
// 매핑이 있는데 해당 키(요일/일자)만 비어있으면 배정 없음(null / 빈배열) — 정책 의도.
export function pickAssignment(customer: AssignmentSource, dateStr: string): Assignment {
  const fallback = (): Assignment => ({
    assigned_to: customer.assigned_user_id ?? null,
    worker_ids: customer.assigned_worker_id ? [customer.assigned_worker_id] : [],
  })
  const map = customer.visit_cycle_unit === 'week'
    ? customer.weekday_assignments
    : customer.visit_cycle_unit === 'month' ? customer.monthly_date_assignments : null
  if (!map) return fallback()
  const hasAny = Object.values(map).some(v =>
    (!!v?.user_id) || (Array.isArray(v?.worker_ids) && v.worker_ids.length > 0),
  )
  if (!hasAny) return fallback()
  const d = new Date(`${dateStr}T00:00:00`)
  const key = customer.visit_cycle_unit === 'week' ? String(d.getDay()) : String(d.getDate())
  const entry = map[key]
  return {
    assigned_to: entry?.user_id ?? null,
    worker_ids: Array.isArray(entry?.worker_ids) ? entry.worker_ids : [],
  }
}

export interface ExistingApp {
  id: string
  construction_date: string
  business_name: string | null
  work_status: string | null
  assigned_to: string | null
}

export interface PlanNames { manager: string | null; workers: string[] }

export interface PlanUpdateRow {
  app_id: string
  date: string
  before: PlanNames
  after: PlanNames
  changed: boolean
}

export interface CustomerPlan {
  customer_id: string
  business_name: string
  /** 새로 만들 회차 날짜 */
  create: string[]
  /** 수정 반영: 유지되는 미완료 회차 (담당자·작업자 전/후) */
  update: PlanUpdateRow[]
  /** 수정 반영: 새 방문일정에 없어 정리(삭제)되는 미완료 회차 */
  delete: string[]
  /** 완료된 회차 — 어떤 모드에서도 손대지 않음 */
  completed: string[]
  /** 생성 모드: 이미 있어 건너뛰는 날짜 */
  existing: string[]
}

async function loadExistingApps(supabase: Supabase, customerId: string, start: string, end: string): Promise<ExistingApp[]> {
  const { data } = await supabase
    .from('service_applications')
    .select('id, construction_date, business_name, work_status, assigned_to')
    .eq('customer_id', customerId)
    .gte('construction_date', start)
    .lte('construction_date', end)
    .is('deleted_at', null)
    .order('construction_date')
  return ((data ?? []) as Array<ExistingApp & { construction_date: string | null }>)
    .filter(a => !!a.construction_date)
    .map(a => ({ ...a, construction_date: String(a.construction_date).slice(0, 10) }))
}

async function loadCurrentWorkers(supabase: Supabase, appIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()
  if (appIds.length === 0) return map
  const { data } = await supabase.from('work_assignments').select('application_id, worker_id').in('application_id', appIds)
  for (const row of (data ?? []) as Array<{ application_id: string; worker_id: string }>) {
    map.set(row.application_id, [...(map.get(row.application_id) ?? []), row.worker_id])
  }
  return map
}

async function resolveNames(supabase: Supabase, userIds: Set<string>, workerIds: Set<string>) {
  const users = new Map<string, string>()
  const workers = new Map<string, string>()
  if (userIds.size > 0) {
    const { data } = await supabase.from('users').select('id, name').in('id', [...userIds])
    for (const u of (data ?? []) as Array<{ id: string; name: string | null }>) users.set(u.id, u.name ?? u.id)
  }
  if (workerIds.size > 0) {
    const { data } = await supabase.from('workers').select('id, name').in('id', [...workerIds])
    for (const w of (data ?? []) as Array<{ id: string; name: string | null }>) workers.set(w.id, w.name ?? w.id)
  }
  return { users, workers }
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join()

/**
 * 기간 내 변경 계획 계산 (쓰기 없음).
 *   regenerate=true  : 수정 반영 — 유지 회차는 담당자·작업자 전/후 비교, 방문일정 밖 미완료 회차는 삭제
 *   regenerate=false : 생성 — 없는 날짜만 신규, 있는 날짜는 건너뜀
 */
export async function buildSchedulePlan(
  supabase: Supabase,
  customer: AssignmentSource,
  scheduledDates: string[],
  start: string,
  end: string,
  regenerate: boolean,
): Promise<CustomerPlan> {
  const existing = await loadExistingApps(supabase, customer.id, start, end)
  const scheduledSet = new Set(scheduledDates)
  const existingDates = new Set(existing.map(a => a.construction_date))
  const plan: CustomerPlan = {
    customer_id: customer.id, business_name: customer.business_name,
    create: scheduledDates.filter(d => !existingDates.has(d)),
    update: [], delete: [], completed: [], existing: [],
  }
  if (!regenerate) {
    plan.existing = scheduledDates.filter(d => existingDates.has(d))
    return plan
  }

  const kept = existing.filter(a => a.work_status !== 'completed' && scheduledSet.has(a.construction_date))
  plan.completed = existing.filter(a => a.work_status === 'completed').map(a => a.construction_date)
  plan.delete = existing.filter(a => a.work_status !== 'completed' && !scheduledSet.has(a.construction_date)).map(a => a.construction_date)

  const currentWorkers = await loadCurrentWorkers(supabase, kept.map(a => a.id))
  const userIds = new Set<string>()
  const workerIds = new Set<string>()
  const rows = kept.map(app => {
    const after = pickAssignment(customer, app.construction_date)
    const beforeWorkers = currentWorkers.get(app.id) ?? []
    if (app.assigned_to) userIds.add(app.assigned_to)
    if (after.assigned_to) userIds.add(after.assigned_to)
    beforeWorkers.forEach(id => workerIds.add(id))
    after.worker_ids.forEach(id => workerIds.add(id))
    return { app, after, beforeWorkers }
  })
  const names = await resolveNames(supabase, userIds, workerIds)
  const nm = (ids: string[]) => ids.map(id => names.workers.get(id) ?? id)
  plan.update = rows.map(({ app, after, beforeWorkers }) => ({
    app_id: app.id,
    date: app.construction_date,
    before: { manager: app.assigned_to ? (names.users.get(app.assigned_to) ?? app.assigned_to) : null, workers: nm(beforeWorkers) },
    after: { manager: after.assigned_to ? (names.users.get(after.assigned_to) ?? after.assigned_to) : null, workers: nm(after.worker_ids) },
    changed: app.assigned_to !== after.assigned_to || !sameSet(beforeWorkers, after.worker_ids),
  }))
  return plan
}

/**
 * 수정 반영으로 담당자가 바뀐 유지 회차의 직원 일정표(service_schedules) 동기화.
 *   있으면 담당자 교체, 없는데 담당자가 생겼으면 새로 만들고, 담당자가 빠졌으면 미시작 일정만 지운다.
 */
export async function syncKeptServiceSchedules(
  supabase: Supabase,
  customer: AssignmentSource & { business_hours_start: string | null; business_hours_end: string | null; care_scope: string | null; special_notes: string | null },
  keptApps: Array<{ id: string; construction_date: string }>,
): Promise<void> {
  if (keptApps.length === 0) return
  const { data } = await supabase.from('service_schedules').select('id, application_id, status').in('application_id', keptApps.map(a => a.id))
  const byApp = new Map<string, Array<{ id: string; status: string | null }>>()
  for (const r of (data ?? []) as Array<{ id: string; application_id: string; status: string | null }>) {
    byApp.set(r.application_id, [...(byApp.get(r.application_id) ?? []), { id: r.id, status: r.status }])
  }
  const toTime = (t: string | null, fallback: string) => (t ? (t.length === 5 ? `${t}:00` : t) : fallback)

  await Promise.all(keptApps.map(async app => {
    const pick = pickAssignment(customer, app.construction_date.slice(0, 10))
    const rows = byApp.get(app.id) ?? []
    if (pick.assigned_to && rows.length > 0) {
      await supabase.from('service_schedules')
        .update({ worker_id: pick.assigned_to, assigned_user_id: pick.assigned_to })
        .in('id', rows.map(r => r.id))
      return
    }
    if (pick.assigned_to) {
      await supabase.from('service_schedules').insert({
        worker_id: pick.assigned_to,
        assigned_user_id: pick.assigned_to,
        customer_id: customer.id,
        scheduled_date: app.construction_date.slice(0, 10),
        scheduled_time_start: toTime(customer.business_hours_start, '09:00:00'),
        scheduled_time_end: toTime(customer.business_hours_end, '18:00:00'),
        status: 'scheduled',
        work_step: 0,
        worker_memo: customer.care_scope ?? customer.special_notes ?? null,
        application_id: app.id,
      })
      return
    }
    const untouched = rows.filter(r => r.status === 'scheduled').map(r => r.id)
    if (untouched.length > 0) await supabase.from('service_schedules').delete().in('id', untouched)
  }))
}
