import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createServiceClient()
  const { id: customerId } = params

  const { data, error } = await supabase
    .from('customer_requests')
    .select('id, content, is_read, created_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ requests: data ?? [] })
}
