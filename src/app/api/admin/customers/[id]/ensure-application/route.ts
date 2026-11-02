/**
 * POST /api/admin/customers/[id]/ensure-application
 *
 * 1회성케어·일반일정 고객에 대해 "배정관리에서 열 수 있는 실제 신청서(service_applications)" 를 보장한다.
 *
 * 배경 (2026-11-03):
 *   배정관리는 고객관리에만 있고 해당 월 신청서가 없는 1회성 고객을 `customer:` 접두사 가짜 항목으로
 *   보여줬고, 클릭하면 고객관리로 튕겨 작업시작/완료 패널을 쓸 수 없었다.
 *   원인은 고객 저장 시 신청서 동기화가 일부 status('예약금 입금' 등)를 건너뛰어 construction_date 가
 *   비어 있던 것. 이 라우트는 클릭 시점에 신청서를 찾거나 보정·생성해 실제 레코드를 돌려준다.
 *
 * 처리 순서:
 *   1) 고객의 next_visit_date 와 같은 날짜의 살아있는 신청서가 있으면 그대로 반환
 *   2) 날짜가 비어 있는 살아있는 신청서가 있으면 날짜·시간·담당자를 채워 반환
 *   3) 둘 다 없으면 고객 마스터를 스냅샷해 새 신청서를 만들어 반환
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> | { id: string } }

const ONE_SHOT_TYPES = new Set(['1회성케어', '일반일정'])
const CANCELLED_STATUSES = ['예약취소', '예약금환급완료']

type CustomerRow = Record<string, unknown> & {
  id: string
  customer_type: string | null
  next_visit_date: string | null
}

export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

  const supabase = createServiceClient()

  try {
    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle()
    if (custErr) throw custErr
    if (!customer) return NextResponse.json({ error: '고객을 찾을 수 없습니다.' }, { status: 404 })

    const cust = customer as CustomerRow
    if (!ONE_SHOT_TYPES.has(cust.customer_type ?? '')) {
      return NextResponse.json({ error: '1회성케어·일반일정 고객만 지원합니다.' }, { status: 400 })
    }
    const visitDate = cust.next_visit_date ? String(cust.next_visit_date).slice(0, 10) : null
    if (!visitDate) {
      return NextResponse.json({ error: '고객의 다음 방문일(시공일자)이 비어 있습니다.' }, { status: 400 })
    }

    const existing = await findSameDateApp(supabase, id, visitDate)
    if (existing) return NextResponse.json({ application: existing, resolved: 'existing' })

    const repaired = await repairDatelessApp(supabase, cust, visitDate)
    if (repaired) return NextResponse.json({ application: repaired, resolved: 'repaired' })

    const created = await createAppFromCustomer(supabase, cust, visitDate)
    return NextResponse.json({ application: created, resolved: 'created' }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('ensure-application 실패:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

type Client = ReturnType<typeof createServiceClient>

/** YYYY-MM-DD 의 다음 날 (date 컬럼·timestamp 컬럼 어느 쪽이든 "당일 이상 · 다음날 미만" 범위로 비교) */
function nextDayIso(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

async function findSameDateApp(supabase: Client, customerId: string, visitDate: string) {
  const { data, error } = await supabase
    .from('service_applications')
    .select('*')
    .eq('customer_id', customerId)
    .is('deleted_at', null)
    .gte('construction_date', visitDate)
    .lt('construction_date', nextDayIso(visitDate))
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

async function repairDatelessApp(supabase: Client, cust: CustomerRow, visitDate: string) {
  const { data: target, error } = await supabase
    .from('service_applications')
    .select('id, assigned_to, construction_time')
    .eq('customer_id', cust.id)
    .is('deleted_at', null)
    .is('construction_date', null)
    .not('status', 'in', `(${CANCELLED_STATUSES.map((s) => `"${s}"`).join(',')})`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!target) return null

  const patch: Record<string, unknown> = { construction_date: visitDate }
  if (!target.construction_time && cust.construction_time) patch.construction_time = cust.construction_time
  if (!target.assigned_to && cust.assigned_user_id) patch.assigned_to = cust.assigned_user_id

  const { data: updated, error: updErr } = await supabase
    .from('service_applications')
    .update(patch)
    .eq('id', target.id)
    .select('*')
    .single()
  if (updErr) throw updErr
  return updated
}

async function createAppFromCustomer(supabase: Client, cust: CustomerRow, visitDate: string) {
  const { data, error } = await supabase
    .from('service_applications')
    .insert({
      customer_id: cust.id,
      business_name: cust.business_name,
      business_number: cust.business_number ?? null,
      owner_name: cust.contact_name,
      phone: cust.contact_phone,
      phone_2: cust.contact_phone_2 ?? null,
      email: cust.email ?? null,
      address: cust.address ?? null,
      business_hours_start: cust.business_hours_start ?? null,
      business_hours_end: cust.business_hours_end ?? null,
      construction_date: visitDate,
      construction_time: cust.construction_time ?? null,
      care_scope: cust.care_scope ?? null,
      service_type: cust.customer_type,
      payment_method: cust.payment_method ?? null,
      supply_amount: cust.supply_amount ?? null,
      vat: cust.vat ?? null,
      request_notes: cust.special_notes ?? null,
      admin_request_notes: cust.admin_notes ?? null,
      assigned_to: cust.assigned_user_id ?? null,
      drive_folder_url: cust.drive_folder_url ?? null,
      progress_status: cust.progress_status ?? '예약확정',
      payment_status_detail: cust.payment_status_detail ?? null,
      source: 'customer_direct',
      status: '기존고객',
      saved_quotes: [],
    })
    .select('*')
    .single()
  if (error) throw error
  return data
}
