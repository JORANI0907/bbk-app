import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

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
  care_scope: string | null
  customer_type: string | null
  visit_schedule_type: 'weekday' | 'monthly_date' | null
  visit_weekdays: number[] | null
  visit_monthly_dates: number[] | null
  unit_price: number | null
  assigned_user_id: string | null
  assigned_worker_id: string | null
  billing_cycle: string | null
  billing_amount: number | null
}

interface GenerateResult {
  customer_id: string
  inserted: number
  skipped: number
}

function getNextMonth(): { year: number; month: number; label: string } {
  const now = new Date()
  const year = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear()
  const month = now.getMonth() === 11 ? 1 : now.getMonth() + 2
  return { year, month, label: `${year}년 ${month}월` }
}

/** 다음달 해당 요일 날짜 목록 반환 */
function getDatesForWeekdays(year: number, month: number, weekdays: number[]): string[] {
  const dates: string[] = []
  const daysInMonth = new Date(year, month, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d)
    if (weekdays.includes(date.getDay())) {
      dates.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
    }
  }
  return dates
}

/** 다음달 해당 날짜 목록 반환 */
function getDatesForMonthlyDates(year: number, month: number, monthlyDates: number[]): string[] {
  const daysInMonth = new Date(year, month, 0).getDate()
  return monthlyDates
    .filter(d => d >= 1 && d <= daysInMonth)
    .map(d => `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
}

export async function POST(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()
  const { customer_ids }: { customer_ids: string[] } = body

  if (!Array.isArray(customer_ids) || customer_ids.length === 0) {
    return NextResponse.json({ error: 'customer_ids가 필요합니다.' }, { status: 400 })
  }

  const { year, month, label } = getNextMonth()

  const { data: customersData, error: fetchError } = await supabase
    .from('customers')
    .select(
      'id, business_name, contact_name, contact_phone, email, address, platform_nickname, business_number, account_number, payment_method, business_hours_start, business_hours_end, elevator, building_access, parking_info, access_method, special_notes, care_scope, customer_type, visit_schedule_type, visit_weekdays, visit_monthly_dates, unit_price, assigned_user_id, assigned_worker_id, billing_cycle, billing_amount'
    )
    .in('id', customer_ids)
    .is('deleted_at', null)

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const customers = (customersData ?? []) as CustomerRow[]

  const results: GenerateResult[] = []
  let totalInserted = 0

  for (const customer of customers) {
    if (
      customer.customer_type !== '정기딥케어' &&
      customer.customer_type !== '정기엔드케어'
    ) {
      results.push({ customer_id: customer.id, inserted: 0, skipped: 0 })
      continue
    }

    let scheduledDates: string[] = []

    if (customer.visit_schedule_type === 'weekday' && customer.visit_weekdays?.length) {
      scheduledDates = getDatesForWeekdays(year, month, customer.visit_weekdays)
    } else if (customer.visit_schedule_type === 'monthly_date' && customer.visit_monthly_dates?.length) {
      scheduledDates = getDatesForMonthlyDates(year, month, customer.visit_monthly_dates)
    }

    if (scheduledDates.length === 0) {
      results.push({ customer_id: customer.id, inserted: 0, skipped: 0 })
      continue
    }

    // 이미 생성된 일정 확인 (중복 방지)
    const { data: existingApps } = await supabase
      .from('service_applications')
      .select('construction_date')
      .eq('business_name', customer.business_name)
      .in('construction_date', scheduledDates)
      .is('deleted_at', null)

    const existingDates = new Set((existingApps ?? []).map((a: { construction_date: string | null }) => a.construction_date))
    const newDates = scheduledDates.filter(d => !existingDates.has(d))
    const skipped = scheduledDates.length - newDates.length

    if (newDates.length === 0) {
      results.push({ customer_id: customer.id, inserted: 0, skipped })
      continue
    }

    const supplyAmount =
      customer.customer_type === '정기딥케어' && customer.billing_cycle === '월간'
        ? (customer.billing_amount || null)
        : null

    const toInsert = newDates.map(date => ({
      business_name: customer.business_name,
      owner_name: customer.contact_name || customer.business_name,
      phone: customer.contact_phone || '',
      email: customer.email || null,
      platform_nickname: customer.platform_nickname || null,
      business_number: customer.business_number || null,
      account_number: customer.account_number || null,
      address: customer.address || '',
      payment_method: customer.payment_method || null,
      business_hours_start: customer.business_hours_start || null,
      business_hours_end: customer.business_hours_end || null,
      elevator: customer.elevator || null,
      building_access: customer.building_access || null,
      parking: customer.parking_info || null,
      access_method: customer.access_method || null,
      request_notes: customer.special_notes || null,
      care_scope: customer.care_scope || null,
      service_type: customer.customer_type,
      assigned_to: customer.assigned_user_id || null,
      unit_price_per_visit: customer.unit_price || null,
      supply_amount: supplyAmount,
      construction_date: date,
      status: '예약확정',
      admin_notes: `고객 DB 자동 일정 생성 (${label})`,
    }))

    const { data: inserted, error: insertError } = await supabase
      .from('service_applications')
      .insert(toInsert)
      .select('id, assigned_to, construction_date, business_hours_start, business_hours_end, care_scope, request_notes, phone')

    if (insertError) {
      results.push({ customer_id: customer.id, inserted: 0, skipped })
      continue
    }

    const insertedApps = inserted ?? []
    const insertedCount = insertedApps.length
    totalInserted += insertedCount

    // 작업자가 있으면 work_assignments에 자동 생성
    if (customer.assigned_worker_id && insertedApps.length > 0) {
      const workerRows = insertedApps.map((app: { id: string; construction_date: string }) => ({
        worker_id: customer.assigned_worker_id,
        application_id: app.id,
        construction_date: app.construction_date.slice(0, 10),
        business_name: customer.business_name,
        customer_id: customer.id,
        service_type: customer.customer_type,
      }))
      await supabase.from('work_assignments').insert(workerRows)
    }

    // assigned_to가 있으면 service_schedules에도 자동 생성
    const toSchedule = insertedApps.filter(
      (app: { assigned_to: string | null; construction_date: string | null }) =>
        app.assigned_to && app.construction_date
    )

    if (toSchedule.length > 0) {
      const toTime = (t: string | null | undefined, fallback: string) =>
        t ? (t.length === 5 ? `${t}:00` : t) : fallback

      const scheduleRows = toSchedule.map((app: {
        id: string
        assigned_to: string
        construction_date: string
        business_hours_start?: string | null
        business_hours_end?: string | null
        care_scope?: string | null
        request_notes?: string | null
      }) => ({
        worker_id: app.assigned_to,
        scheduled_date: app.construction_date.slice(0, 10),
        scheduled_time_start: toTime(customer.business_hours_start, '09:00:00'),
        scheduled_time_end: toTime(customer.business_hours_end, '18:00:00'),
        status: 'scheduled',
        work_step: 0,
        worker_memo: customer.care_scope ?? customer.special_notes ?? null,
        application_id: app.id,
      }))

      await supabase.from('service_schedules').insert(scheduleRows)
    }

    results.push({ customer_id: customer.id, inserted: insertedCount, skipped })
  }

  return NextResponse.json({ results, totalInserted, targetMonth: label })
}
