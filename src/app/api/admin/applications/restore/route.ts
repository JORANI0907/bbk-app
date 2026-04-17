import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  const session = getServerSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: '관리자만 접근 가능합니다.' }, { status: 403 })
  }

  const body = await request.json() as { id?: string; ids?: string[] }
  const ids: string[] = body.ids ?? (body.id ? [body.id] : [])

  if (ids.length === 0) {
    return NextResponse.json({ error: 'id 또는 ids가 필요합니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // 신청서 복원
  const { error } = await supabase
    .from('service_applications')
    .update({ deleted_at: null })
    .in('id', ids)
    .not('deleted_at', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 연결된 service_schedules도 복원
  await supabase
    .from('service_schedules')
    .update({ deleted_at: null })
    .in('application_id', ids)
    .not('deleted_at', 'is', null)

  return NextResponse.json({ success: true, restored: ids.length })
}
