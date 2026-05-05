import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { format } from 'date-fns'

export async function GET() {
  const session = getServerSession()
  if (!session || session.role !== 'customer') {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const { data: customerRow } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', session.userId)
    .maybeSingle()

  if (!customerRow) {
    return NextResponse.json({ data: [] })
  }

  const today = format(new Date(), 'yyyy-MM-dd')
  const { data, error } = await supabase
    .from('service_schedules')
    .select('id, scheduled_date, items_this_visit, status')
    .eq('customer_id', customerRow.id)
    .gte('scheduled_date', today)
    .in('status', ['scheduled', 'confirmed'])
    .order('scheduled_date', { ascending: true })
    .limit(10)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}
