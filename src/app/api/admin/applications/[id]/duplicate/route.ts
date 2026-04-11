import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient()
  const { id } = params

  if (!id) {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })
  }

  // 원본 조회
  const { data: original, error: fetchError } = await supabase
    .from('service_applications')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !original) {
    return NextResponse.json({ error: '원본 데이터를 찾을 수 없습니다.' }, { status: 404 })
  }

  // 복제본 생성 (id, created_at, status, notification_log, work_status 초기화)
  const {
    id: _omitId,
    created_at: _omitCreatedAt,
    ...rest
  } = original as Record<string, unknown>

  const duplicate: Record<string, unknown> = {
    ...rest,
    status: '신규',
    notification_log: null,
    work_status: 'pending',
  }

  const { data: inserted, error: insertError } = await supabase
    .from('service_applications')
    .insert(duplicate)
    .select()
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ application: inserted })
}
