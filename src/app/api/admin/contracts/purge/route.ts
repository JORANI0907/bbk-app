import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// DELETE /api/admin/contracts/purge?ids=id1,id2 — 계약서 완전 삭제
export async function DELETE(request: NextRequest) {
  const supabase = createServiceClient()

  const { searchParams } = new URL(request.url)
  const idsParam = searchParams.get('ids')
  if (!idsParam) {
    return NextResponse.json({ success: false, error: '삭제할 항목을 선택해주세요.' }, { status: 400 })
  }

  const ids = idsParam.split(',').filter(Boolean)
  if (ids.length === 0) {
    return NextResponse.json({ success: false, error: '삭제할 항목을 선택해주세요.' }, { status: 400 })
  }

  // 휴지통에 있는 것만 완전 삭제 가능
  const { error } = await supabase
    .from('contracts')
    .delete()
    .in('id', ids)
    .not('deleted_at', 'is', null)

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, message: `계약서 ${ids.length}건이 완전 삭제되었습니다.` })
}
