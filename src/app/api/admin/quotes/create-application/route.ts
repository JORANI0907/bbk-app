import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSlack } from '@/lib/slack'

// 견적관리 전용 신청서 생성 라우트.
// - source='quote'로 자동 마킹 (서비스관리 뷰와 구분)
// - Slack 알림은 별도 문구('견적관리 등록')
// - form 유입 웹훅의 자동 알림톡·예약금 결제 자동화는 여기서 발동되지 않음
export async function POST(request: NextRequest) {
  const body = await request.json()

  if (!body.business_name || !body.owner_name || !body.phone || !body.address) {
    return NextResponse.json({ error: '업체명, 대표자명, 연락처, 주소는 필수입니다.' }, { status: 400 })
  }

  const ALLOWED = [
    'owner_name', 'business_name', 'phone', 'phone_2', 'phone_notify_1', 'phone_notify_2', 'email',
    'address', 'business_hours_start', 'business_hours_end',
    'construction_date', 'construction_time', 'care_scope',
    'service_type', 'payment_method',
  ]
  const insert: Record<string, unknown> = { status: '신규', source: 'quote' }
  for (const key of ALLOWED) {
    if (key in body) insert[key] = body[key]
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('service_applications')
    .insert(insert)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Slack 알림
  const kstTime = new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
  sendSlack(
    `📋 *새 서비스 신청 (견적관리 등록)*\n` +
    `• 업체명: ${body.business_name}\n` +
    `• 대표자: ${body.owner_name}\n` +
    `• 연락처: ${body.phone}\n` +
    `• 주소: ${body.address}\n` +
    `• 접수시각: ${kstTime}`
  ).catch(() => {})

  return NextResponse.json({ application: data }, { status: 201 })
}

// 견적관리 전용 고객 정보 업데이트 라우트.
// PATCH /api/admin/quotes/create-application (id는 body에)
// 기존 PATCH /api/admin/applications와 동일한 결과지만 견적관리 컨텍스트로 로그·향후 확장 용이.
export async function PATCH(request: NextRequest) {
  const body = await request.json()
  const { id, ...rest } = body
  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

  const ALLOWED = [
    'owner_name', 'business_name', 'phone', 'phone_2', 'phone_notify_1', 'phone_notify_2', 'email',
    'address', 'business_hours_start', 'business_hours_end',
    'construction_date', 'construction_time', 'care_scope',
  ]
  const updates: Record<string, unknown> = {}
  for (const key of ALLOWED) {
    if (key in rest) updates[key] = rest[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: true })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('service_applications')
    .update(updates)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
