import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// POST /api/admin/contracts/restore — 계약서 복원
export async function POST(request: NextRequest) {
  const supabase = createServiceClient()

  let body: { ids?: string[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 형식입니다.' }, { status: 400 })
  }

  const { ids } = body
  if (!ids || ids.length === 0) {
    return NextResponse.json({ success: false, error: '복원할 항목을 선택해주세요.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('contracts')
    .update({ deleted_at: null })
    .in('id', ids)

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, message: `계약서 ${ids.length}건이 복원되었습니다.` })
}
