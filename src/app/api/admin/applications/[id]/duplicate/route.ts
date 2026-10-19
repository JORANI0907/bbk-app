import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { buildCustomerSnapshot } from '@/lib/customer-snapshot'

/**
 * 신청서(service_applications) 복제.
 *
 * 2026-10-19 중요 수정 (근본 분리):
 *   과거엔 원본 신청서의 customer_id 를 그대로 복제본에도 복사했음. 그 결과:
 *     - 복제본과 원본이 같은 customers 마스터를 공유
 *     - 복제본만 수정했는데도 축 C(service_applications→customers) 로 공유 마스터가 변경
 *     - 다시 축 A(customers→service_applications) 로 원본까지 전파되는 "복제 환각 유출" 사고 발생
 *     - 사장님 보고: "복제 DB 수정했는데 과거 복제본들에도 반영됨"
 *
 *   해결: 신청서 복제 시 customer 마스터도 함께 복제. 복제본은 자신만의 새 customer_id 를
 *   가져 원본 customer 와 완전 분리됨. 어떤 축으로 sync 가 발동해도 서로 영향 없음.
 *
 *   원본에 customer_id 가 없는 pending 신청서는 그대로 customer_id=null 로 복제 (기존 동작).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient()
  const { id } = params

  if (!id) {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })
  }

  // 원본 신청서 조회
  const { data: original, error: fetchError } = await supabase
    .from('service_applications')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !original) {
    return NextResponse.json({ error: '원본 데이터를 찾을 수 없습니다.' }, { status: 404 })
  }

  const originalRow = original as Record<string, unknown>
  const originalCustomerId = (originalRow.customer_id as string | null) ?? null

  // 2026-10-19 핵심: 원본에 customer 가 연결돼 있으면 customer master 를 함께 복제해
  // 복제본이 자신만의 customer_id 를 갖도록 분리. 없으면 null 유지 (pending 신청서 복제).
  let newCustomerId: string | null = null
  if (originalCustomerId) {
    const { data: origCustomer, error: custFetchError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', originalCustomerId)
      .single()

    if (custFetchError || !origCustomer) {
      return NextResponse.json(
        { error: '원본 고객 마스터를 찾을 수 없습니다. 복제를 중단합니다.' },
        { status: 404 },
      )
    }

    const customerSnapshot = buildCustomerSnapshot(origCustomer as Record<string, unknown>)
    const { data: newCustomer, error: custInsertError } = await supabase
      .from('customers')
      .insert(customerSnapshot)
      .select('id')
      .single()

    if (custInsertError || !newCustomer) {
      return NextResponse.json(
        { error: `복제용 고객 생성 실패: ${custInsertError?.message ?? 'unknown'}` },
        { status: 500 },
      )
    }

    newCustomerId = (newCustomer as { id: string }).id
  }

  // 복제본 신청서 생성 — 상태/알림/외부 리소스는 전부 리셋
  const {
    id: _omitId,
    created_at: _omitCreatedAt,
    customer_id: _omitCustomerId,
    ...rest
  } = originalRow

  const duplicate: Record<string, unknown> = {
    ...rest,
    customer_id: newCustomerId, // 핵심: 새 customer_id (또는 null)
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
    balance_paid_at: null,
    tax_invoice_issued: false,
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
