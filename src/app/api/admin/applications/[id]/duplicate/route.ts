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

  // 복제본 생성 — 원본과 완전히 무관한 별도 레코드
  // 초기화 대상: 시스템 필드(id/created_at), 상태 필드, 알림 이력, 외부 리소스 링크(드라이브 폴더 등)
  const {
    id: _omitId,
    created_at: _omitCreatedAt,
    ...rest
  } = original as Record<string, unknown>

  const duplicate: Record<string, unknown> = {
    ...rest,
    status: '신규',
    progress_status: '신청서작성', // Phase 8-C
    payment_status_detail: null,   // Phase 8-C: 복제 시 결제 이력 리셋
    work_status: 'pending',
    gcal_event_id: null,
    work_started_at: null,
    work_completed_at: null,
    notification_send_at: null,
    notification_sent_at: null,
    remind_1day_sent_at: null,
    remind_day_sent_at: null,
    payment_confirmed_at: null,
    invoice_issued_at: null,
    deposit_paid_at: null,
    quote_sent_at: null,
    quote_url: null,
    quote_pdf_url: null,
    // 알림 이력·외부 리소스 초기화 (사용자 요청: 원본과 관계없는 별도 레코드)
    notification_log: null,
    drive_folder_url: null,
    notion_page_id: null,
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
