import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateMonthlySchedule, getNextMonth, weekdayLabel } from '@/lib/schedule-generator'
import { sendSMS } from '@/lib/solapi'

const CRON_SECRET = process.env.CRON_SECRET

interface CustomerRow {
  id: string
  business_name: string
  contact_name: string | null
  contact_phone: string | null
  email: string | null
  address: string | null
  // 일반정보 추가
  platform_nickname: string | null
  business_number: string | null
  account_number: string | null
  // 작업장정보
  payment_method: string | null
  business_hours_start: string | null
  business_hours_end: string | null
  elevator: string | null
  building_access: string | null
  parking_info: string | null
  access_method: string | null
  special_notes: string | null
  care_scope: string | null
  customer_type: string
  visit_schedule_type: string | null
  visit_weekdays: number[] | null
  visit_monthly_dates: number[] | null
  status: string | null
  unit_price: number | null
  assigned_worker_id: string | null
  billing_cycle: string | null
  billing_amount: number | null
}

function buildSmsMessage(
  contact_name: string | null,
  business_name: string,
  month: number,
  dates: string[],
): string {
  const dateStr = dates
    .map((d) => `${parseInt(d.slice(5, 7))}월 ${parseInt(d.slice(8, 10))}일`)
    .join(', ')
  return (
    `[BBK 공간케어] ${contact_name ?? ''}님, ${business_name}의 ${month}월 방문 일정을 안내드립니다.\n` +
    `방문일: ${dateStr}\n` +
    `일정 변경을 원하시면 고객 포털에서 요청해주세요.\n` +
    `문의: 031-759-4877`
  )
}

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret') ?? request.headers.get('authorization')?.replace('Bearer ', '')
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const dryRun = searchParams.get('dry_run') === 'true'

  const supabase = createServiceClient()
  const { year, month } = getNextMonth()
  const label = `${year}년 ${month}월`

  const { data: customers, error } = await supabase
    .from('customers')
    .select(
      'id, business_name, contact_name, contact_phone, email, address, ' +
      'platform_nickname, business_number, account_number, ' +
      'payment_method, business_hours_start, business_hours_end, elevator, building_access, parking_info, ' +
      'access_method, special_notes, care_scope, customer_type, ' +
      'visit_schedule_type, visit_weekdays, visit_monthly_dates, status, unit_price, ' +
      'assigned_worker_id, billing_cycle, billing_amount'
    )
    .in('customer_type', ['정기딥케어', '정기엔드케어'])
    .eq('status', 'active')
    .not('visit_schedule_type', 'is', null)
    .is('deleted_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: Array<{
    customerId: string
    businessName: string
    dates: string[]
    smsStatus: string
    inserted: number
    skipped: number
  }> = []

  for (const customer of ((customers as unknown) as CustomerRow[]) ?? []) {
    if (!customer.visit_schedule_type) continue

    const dates = generateMonthlySchedule(
      year,
      month,
      customer.visit_schedule_type as 'weekday' | 'monthly_date',
      customer.visit_weekdays ?? [],
      customer.visit_monthly_dates ?? [],
    )

    if (dates.length === 0) continue

    let inserted = 0
    let skipped = 0
    let smsStatus = 'skipped (dry_run)'

    if (!dryRun) {
      // service_applications 중복 확인 (업체명 + 방문일자 기준)
      const { data: existingApps } = await supabase
        .from('service_applications')
        .select('construction_date')
        .eq('business_name', customer.business_name)
        .in('construction_date', dates)
        .is('deleted_at', null)

      const existingAppDates = new Set(
        (existingApps ?? []).map((a: { construction_date: string | null }) => a.construction_date)
      )
      const newDates = dates.filter((d) => !existingAppDates.has(d))
      skipped = dates.length - newDates.length

      if (newDates.length > 0) {
        // 1. service_applications에 먼저 insert
        const supplyAmount =
          customer.customer_type === '정기딥케어' && customer.billing_cycle === '월간'
            ? (customer.billing_amount || null)
            : null

        const toInsert = newDates.map((date) => ({
          // 일반정보
          business_name: customer.business_name,
          owner_name: customer.contact_name || customer.business_name,
          phone: customer.contact_phone || '',
          email: customer.email || null,
          platform_nickname: customer.platform_nickname || null,
          business_number: customer.business_number || null,
          account_number: customer.account_number || null,
          // 작업장정보
          address: customer.address || '',
          elevator: customer.elevator || null,
          building_access: customer.building_access || null,
          parking: customer.parking_info || null,
          access_method: customer.access_method || null,
          business_hours_start: customer.business_hours_start || null,
          business_hours_end: customer.business_hours_end || null,
          // 시공정보
          care_scope: customer.care_scope || null,
          request_notes: customer.special_notes || null,
          // 결제정보
          payment_method: customer.payment_method || null,
          unit_price_per_visit: customer.unit_price || null,
          supply_amount: supplyAmount,
          // 메타
          service_type: customer.customer_type,
          assigned_to: customer.assigned_worker_id || null,
          construction_date: date,
          status: '예약확정',
          admin_notes: `cron 자동 일정 생성 (${label})`,
        }))

        const { data: insertedApps, error: insertError } = await supabase
          .from('service_applications')
          .insert(toInsert)
          .select('id, assigned_to, construction_date, business_hours_start, business_hours_end')

        if (!insertError && insertedApps) {
          inserted = insertedApps.length

          // 2. assigned_to가 있는 경우 service_schedules에도 생성 (FK 연결)
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
            }) => ({
              worker_id: app.assigned_to,
              scheduled_date: app.construction_date.slice(0, 10),
              scheduled_time_start: toTime(customer.business_hours_start, '09:00:00'),
              scheduled_time_end: toTime(customer.business_hours_end, '18:00:00'),
              status: 'scheduled',
              work_step: 0,
              worker_memo: customer.care_scope ?? customer.special_notes ?? null,
              application_id: app.id,
              customer_id: customer.id,
            }))

            await supabase.from('service_schedules').insert(scheduleRows)
          }
        }
      }

      // SMS 발송
      const phone = (customer.contact_phone ?? '').replace(/-/g, '')
      if (phone && inserted > 0) {
        const msg = buildSmsMessage(customer.contact_name, customer.business_name, month, dates)
        try {
          await sendSMS(phone, msg)
          smsStatus = 'sent'
        } catch (e) {
          smsStatus = `error: ${e instanceof Error ? e.message : String(e)}`
        }
      } else if (!phone) {
        smsStatus = 'no phone'
      } else {
        smsStatus = 'skipped (all exists)'
      }
    }

    results.push({
      customerId: customer.id,
      businessName: customer.business_name,
      dates,
      smsStatus,
      inserted,
      skipped,
    })
  }

  return NextResponse.json({
    success: true,
    targetMonth: `${year}-${String(month).padStart(2, '0')}`,
    processed: results.length,
    dryRun,
    results,
  })
}
