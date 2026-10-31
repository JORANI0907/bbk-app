/**
 * 정기 고객 투입일정(회차) 수동 추가 (2026-11-01)
 *
 * 고객관리 정기 진행흐름의 월 섹션에서 [+ 일정 추가] 버튼으로 호출.
 * 일괄 생성(generate-schedules)과 같은 모양으로 service_applications 1건을 만들고,
 * 작업자(work_assignments)·담당자 일정(service_schedules)도 같이 만든다.
 *
 * POST /api/admin/customers/[id]/visits
 *   body: { date: 'YYYY-MM-DD', time?: 'HH:MM', assigned_to?: string|null, worker_ids?: string[] }
 *   assigned_to / worker_ids 를 안 보내면 고객의 기본 담당자·작업자(요일·일자별 매핑 포함)를 쓴다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

type Assignment = { user_id: string | null; worker_ids: string[] }

interface CustomerRow {
  id: string
  business_name: string
  contact_name: string | null
  contact_phone: string | null
  email: string | null
  address: string | null
  platform_nickname: string | null
  business_number: string | null
  account_number: string | null
  payment_method: string | null
  business_hours_start: string | null
  business_hours_end: string | null
  elevator: string | null
  building_access: string | null
  parking_info: string | null
  access_method: string | null
  special_notes: string | null
  admin_notes: string | null
  notes: string | null
  care_scope: string | null
  customer_type: string | null
  status: string | null
  visit_cycle_unit: string | null
  unit_price: number | null
  billing_cycle: string | null
  assigned_user_id: string | null
  assigned_worker_id: string | null
  weekday_assignments: Record<string, Assignment> | null
  monthly_date_assignments: Record<string, Assignment> | null
}

/** 고객 기본 담당자·작업자 (요일별/일자별 매핑이 있으면 그 날짜 기준) — generate-schedules 와 같은 규칙 */
function pickDefaultAssignment(c: CustomerRow, dateStr: string): { assigned_to: string | null; worker_ids: string[] } {
  const fallback = { assigned_to: c.assigned_user_id ?? null, worker_ids: c.assigned_worker_id ? [c.assigned_worker_id] : [] }
  const hasAny = (m: Record<string, Assignment> | null) =>
    !!m && Object.values(m).some(v => !!v?.user_id || (Array.isArray(v?.worker_ids) && v.worker_ids.length > 0))
  const d = new Date(`${dateStr}T00:00:00`)
  if (c.visit_cycle_unit === 'week' && hasAny(c.weekday_assignments)) {
    const e = c.weekday_assignments![String(d.getDay())]
    return { assigned_to: e?.user_id ?? null, worker_ids: Array.isArray(e?.worker_ids) ? e.worker_ids : [] }
  }
  if (c.visit_cycle_unit === 'month' && hasAny(c.monthly_date_assignments)) {
    const e = c.monthly_date_assignments![String(d.getDate())]
    return { assigned_to: e?.user_id ?? null, worker_ids: Array.isArray(e?.worker_ids) ? e.worker_ids : [] }
  }
  return fallback
}

const toTime = (t: string | null | undefined, fallback: string) => (t ? (t.length === 5 ? `${t}:00` : t) : fallback)

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = await request.json() as { date?: string; time?: string | null; assigned_to?: string | null; worker_ids?: string[] }
    const date = String(body.date ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: '날짜(YYYY-MM-DD)가 필요합니다.' }, { status: 400 })
    }
    const time = body.time && /^\d{2}:\d{2}/.test(body.time) ? body.time.slice(0, 5) : null

    const supabase = createServiceClient()
    const { data: custRaw, error: custErr } = await supabase
      .from('customers')
      .select('id, business_name, contact_name, contact_phone, email, address, platform_nickname, business_number, account_number, payment_method, business_hours_start, business_hours_end, elevator, building_access, parking_info, access_method, special_notes, admin_notes, notes, care_scope, customer_type, status, visit_cycle_unit, unit_price, billing_cycle, assigned_user_id, assigned_worker_id, weekday_assignments, monthly_date_assignments')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle()
    if (custErr || !custRaw) return NextResponse.json({ error: '고객을 찾을 수 없습니다.' }, { status: 404 })
    const c = custRaw as unknown as CustomerRow
    if (c.customer_type !== '정기딥케어' && c.customer_type !== '정기엔드케어') {
      return NextResponse.json({ error: '정기 고객만 회차를 추가할 수 있습니다.' }, { status: 400 })
    }

    // 같은 날 회차 중복 방지
    const { data: dup } = await supabase
      .from('service_applications')
      .select('id')
      .eq('customer_id', c.id)
      .eq('construction_date', date)
      .is('deleted_at', null)
      .limit(1)
    if (dup && dup.length > 0) {
      return NextResponse.json({ error: `${date} 에 이미 투입일정이 있습니다.` }, { status: 409 })
    }

    const def = pickDefaultAssignment(c, date)
    const assignedTo = body.assigned_to === undefined ? def.assigned_to : (body.assigned_to || null)
    const workerIds = Array.isArray(body.worker_ids) ? body.worker_ids.filter(w => typeof w === 'string' && w) : def.worker_ids
    const isAnnual = c.billing_cycle === '연간'

    const { data: inserted, error: insErr } = await supabase
      .from('service_applications')
      .insert({
        customer_id: c.id,
        business_name: c.business_name,
        owner_name: c.contact_name || c.business_name,
        phone: c.contact_phone || '',
        email: c.email || null,
        platform_nickname: c.platform_nickname || null,
        business_number: c.business_number || null,
        account_number: c.account_number || null,
        address: c.address || '',
        payment_method: c.payment_method || null,
        business_hours_start: c.business_hours_start || null,
        business_hours_end: c.business_hours_end || null,
        elevator: c.elevator || null,
        building_access: c.building_access || null,
        parking: c.parking_info || null,
        access_method: c.access_method || null,
        request_notes: c.special_notes || null,
        care_scope: c.care_scope || null,
        admin_request_notes: c.admin_notes || null,
        admin_notes: c.notes || null,
        service_type: c.customer_type,
        assigned_to: assignedTo,
        unit_price_per_visit: isAnnual ? null : (c.unit_price || null),
        payment_status_detail: c.customer_type === '정기딥케어' && isAnnual ? '계산서발행완료' : null,
        construction_date: date,
        construction_time: time,
        status: '예약확정',
        internal_memo: '관리자 수동 일정 추가',
      })
      .select('id')
      .single()
    if (insErr || !inserted) return NextResponse.json({ error: `회차 생성 실패: ${insErr?.message ?? 'unknown'}` }, { status: 500 })
    const appId = inserted.id as string

    if (workerIds.length > 0) {
      await supabase.from('work_assignments').upsert(
        workerIds.map(wid => ({
          worker_id: wid, application_id: appId, construction_date: date,
          business_name: c.business_name, customer_id: c.id, service_type: c.customer_type,
        })),
        { onConflict: 'worker_id,application_id', ignoreDuplicates: true },
      )
    }

    if (assignedTo) {
      await supabase.from('service_schedules').insert({
        worker_id: assignedTo,
        assigned_user_id: assignedTo,
        customer_id: c.id,
        scheduled_date: date,
        scheduled_time_start: toTime(time ?? c.business_hours_start, '09:00:00'),
        scheduled_time_end: toTime(c.business_hours_end, '18:00:00'),
        status: 'scheduled',
        work_step: 0,
        worker_memo: c.care_scope ?? c.special_notes ?? null,
        application_id: appId,
      })
    }

    return NextResponse.json({ ok: true, id: appId, date, assigned_to: assignedTo, worker_ids: workerIds }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
