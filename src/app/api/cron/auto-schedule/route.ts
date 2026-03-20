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
  customer_type: string
  visit_schedule_type: string | null
  visit_weekdays: number[] | null
  visit_monthly_dates: number[] | null
  status: string | null
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
    `[BBK 공간케어] ${contact_name ?? ''}님, ${business_name}의 ${month}월 정기케어 방문 일정을 안내드립니다.\n` +
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

  const { data: customers, error } = await supabase
    .from('customers')
    .select('id, business_name, contact_name, contact_phone, customer_type, visit_schedule_type, visit_weekdays, visit_monthly_dates, status')
    .in('customer_type', ['정기딥케어', '정기엔드케어'])
    .eq('status', 'active')
    .not('visit_schedule_type', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: Array<{ customerId: string; businessName: string; dates: string[]; smsStatus: string; inserted: number }> = []

  for (const customer of (customers as CustomerRow[]) ?? []) {
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
    let smsStatus = 'skipped (dry_run)'

    if (!dryRun) {
      // 중복 체크
      const { data: existing } = await supabase
        .from('service_schedules')
        .select('scheduled_date')
        .eq('customer_id', customer.id)
        .in('scheduled_date', dates)

      const existingDates = new Set((existing ?? []).map((s: { scheduled_date: string }) => s.scheduled_date))
      const newDates = dates.filter((d) => !existingDates.has(d))

      if (newDates.length > 0) {
        const rows = newDates.map((d) => ({
          customer_id: customer.id,
          scheduled_date: d,
          status: 'scheduled',
        }))
        const { error: insertError } = await supabase.from('service_schedules').insert(rows)
        if (!insertError) inserted = newDates.length
      }

      // SMS 발송
      const phone = (customer.contact_phone ?? '').replace(/-/g, '')
      if (phone) {
        const msg = buildSmsMessage(customer.contact_name, customer.business_name, month, dates)
        try {
          await sendSMS(phone, msg)
          smsStatus = 'sent'
        } catch (e) {
          console.error(`SMS send error for ${customer.business_name}:`, e)
          smsStatus = `error: ${e instanceof Error ? e.message : String(e)}`
        }
      } else {
        smsStatus = 'no phone'
      }
    }

    results.push({
      customerId: customer.id,
      businessName: customer.business_name,
      dates,
      smsStatus,
      inserted,
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
