import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getServerSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { memo_visible } = await req.json()
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('service_schedules')
    .update({ memo_visible: Boolean(memo_visible) })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
