import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createServiceClient()
  const { id: customerId } = params

  const { data, error } = await supabase
    .from('service_schedules')
    .select('id, scheduled_date, worker_memo, memo_visible, status')
    .eq('customer_id', customerId)
    .not('worker_memo', 'is', null)
    .order('scheduled_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ schedules: data ?? [] })
}
