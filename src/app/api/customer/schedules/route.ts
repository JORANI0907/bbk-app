import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { getPortalCustomers } from '@/lib/customer-portal'
import { format } from 'date-fns'

export const dynamic = 'force-dynamic'


export async function GET() {
  const session = getServerSession()
  if (!session || session.role !== 'customer') {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const { ids: customerIds } = await getPortalCustomers(supabase, session.userId)

  if (customerIds.length === 0) {
    return NextResponse.json({ data: [] })
  }

  const today = format(new Date(), 'yyyy-MM-dd')
  const { data, error } = await supabase
    .from('service_schedules')
    .select('id, scheduled_date, items_this_visit, status')
    .in('customer_id', customerIds)
    .gte('scheduled_date', today)
    .is('deleted_at', null)
    .in('status', ['scheduled', 'confirmed'])
    .order('scheduled_date', { ascending: true })
    .limit(10)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}
