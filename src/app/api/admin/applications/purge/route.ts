import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

export async function DELETE(request: NextRequest) {
  const session = getServerSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: '관리자만 접근 가능합니다.' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const idsParam = searchParams.get('ids')
  const ids: string[] = idsParam
    ? idsParam.split(',').filter(Boolean)
    : id
    ? [id]
    : []

  if (ids.length === 0) {
    return NextResponse.json({ error: 'id 또는 ids가 필요합니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // 연결된 사진 먼저 삭제
  await supabase.from('application_photos').delete().in('application_id', ids)

  // 휴지통에 있는 항목만 완전 삭제 (FK CASCADE로 schedules 자동 삭제)
  const { error } = await supabase
    .from('service_applications')
    .delete()
    .in('id', ids)
    .not('deleted_at', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, purged: ids.length })
}
