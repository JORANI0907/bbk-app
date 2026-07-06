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
    .from('customers')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !original) {
    return NextResponse.json({ error: '원본 데이터를 찾을 수 없습니다.' }, { status: 404 })
  }

  // 복제본 생성 — 원본과 완전히 무관한 별도 레코드
  // 초기화: 시스템 필드(id/created_at/updated_at), 외부 리소스 링크, 포털 계정, 상태 이력
  const {
    id: _omitId,
    created_at: _omitCreatedAt,
    updated_at: _omitUpdatedAt,
    ...rest
  } = original as Record<string, unknown>

  const duplicate: Record<string, unknown> = {
    ...rest,
    // 외부 리소스 링크 초기화 (원본과 무관하게)
    drive_folder_url: null,
    // 포털 계정은 절대 공유 금지 — 새 고객이므로 신규 발급 필요
    user_id: null,
    // 다음 방문·결제 스케줄도 초기화 (새 고객이 별도 스케줄 잡음)
    next_visit_date: null,
    billing_next_date: null,
    payment_status: null,
    // 소프트 삭제 흔적 제거
    deleted_at: null,
  }

  const { data: inserted, error: insertError } = await supabase
    .from('customers')
    .insert(duplicate)
    .select()
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ customer: inserted })
}
