import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  calcComfortIndex,
  calcOuterComfortIndex,
  calcProgressPct,
  RecentScheduleRow,
} from '@/lib/customer-indices'
import { format, addMonths } from 'date-fns'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const phone = searchParams.get('phone')
  if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 })

  const supabase = createServiceClient()

  const { data: user } = await supabase
    .from('users')
    .select('id, name, phone')
    .eq('phone', phone)
    .maybeSingle()

  if (!user) return NextResponse.json({ error: 'user not found', phone }, { status: 404 })

  const { data: customer } = await supabase
    .from('customers')
    .select('id, business_name, drive_folder_url, grade, status, customer_type')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!customer) {
    return NextResponse.json({ error: 'customer not found', user }, { status: 404 })
  }

  const today = format(new Date(), 'yyyy-MM-dd')
  const thisMonth = today.slice(0, 7)
  const thisMonthStart = `${thisMonth}-01`
  const nextMonthStart = format(addMonths(new Date(thisMonthStart), 1), 'yyyy-MM-dd')

  const { data: recentRaw, error: recentErr } = await supabase
    .from('service_schedules')
    .select('*, worker:users(id,name), closing_checklists(condition_score, recommended_services, customer_comment)')
    .eq('customer_id', customer.id)
    .eq('status', 'completed')
    .is('deleted_at', null)
    .order('scheduled_date', { ascending: false })
    .limit(5)

  const { data: monthlyRaw, error: monthlyErr } = await supabase
    .from('service_schedules')
    .select('id, status')
    .eq('customer_id', customer.id)
    .gte('scheduled_date', thisMonthStart)
    .lt('scheduled_date', nextMonthStart)

  const recent = (recentRaw ?? []) as RecentScheduleRow[]
  const monthly = (monthlyRaw ?? []) as { id: string; status: string }[]

  return NextResponse.json({
    today,
    thisMonth,
    user,
    customer,
    queries: {
      recent_count: recent.length,
      recent_error: recentErr?.message ?? null,
      monthly_count: monthly.length,
      monthly_error: monthlyErr?.message ?? null,
    },
    indices: {
      comfortIndex: calcComfortIndex(recent),
      outerComfortIndex: calcOuterComfortIndex(recent),
      progressPct: calcProgressPct(monthly),
    },
    recent_dump: recent.map((r) => ({
      id: r.id,
      scheduled_date: r.scheduled_date,
      closing_checklists: r.closing_checklists,
    })),
    monthly_dump: monthly,
  })
}
