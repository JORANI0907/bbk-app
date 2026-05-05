import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

export async function GET() {
  const session = getServerSession()
  if (!session || session.role !== 'customer') {
    return NextResponse.json({ error: '고객 전용' }, { status: 403 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('requests')
    .select('id, status, admin_memo, extra_data, checked_at')
    .eq('requester_id', session.userId)
    .eq('category', 'schedule_change')
    .eq('requester_read', false)
    .neq('status', 'pending')
    .order('checked_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}
