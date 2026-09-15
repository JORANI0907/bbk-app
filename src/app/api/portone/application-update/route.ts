import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// 편집 가능한 필드 화이트리스트 — /bbk-care 신청서(form.html)에 있는 필드만 허용
// 결제 관련(deposit/supply/vat/payment_method/service_type)과 관리자 전용(care_scope/space_size/
// construction_date/meeting_time/customer_memo 등)은 제외
const EDITABLE_FIELDS = [
  'business_name', 'business_number',
  'address',
  'business_hours_start', 'business_hours_end',
  'owner_name', 'phone', 'email',
  'elevator', 'building_access', 'parking',
  'access_method', 'request_notes',
] as const

type EditableField = typeof EDITABLE_FIELDS[number]

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as {
      appId?: string
      updates?: Record<string, string | null>
    }
    const { appId, updates } = body

    if (!appId) {
      return NextResponse.json({ error: 'appId가 필요합니다.' }, { status: 400 })
    }
    if (!updates || typeof updates !== 'object') {
      return NextResponse.json({ error: 'updates 객체가 필요합니다.' }, { status: 400 })
    }

    // 허용 필드만 필터링 (그 외는 무시)
    const filtered: Record<string, string | null> = {}
    for (const [key, value] of Object.entries(updates)) {
      if ((EDITABLE_FIELDS as readonly string[]).includes(key)) {
        // 빈 문자열은 null로 저장 (Supabase 관행)
        filtered[key] = typeof value === 'string' && value.trim() === '' ? null : value
      }
    }

    if (Object.keys(filtered).length === 0) {
      return NextResponse.json({ error: '편집 가능한 필드가 없습니다.' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // 결제 완료된 신청서는 편집 불가 (안전장치)
    const { data: existing } = await supabase
      .from('service_applications')
      .select('deposit_paid_at, deleted_at')
      .eq('id', appId)
      .single()

    if (!existing || existing.deleted_at) {
      return NextResponse.json({ error: '신청서를 찾을 수 없습니다.' }, { status: 404 })
    }
    if (existing.deposit_paid_at) {
      return NextResponse.json({ error: '결제가 완료된 신청서는 수정할 수 없습니다.' }, { status: 409 })
    }

    const { error } = await supabase
      .from('service_applications')
      .update(filtered)
      .eq('id', appId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, updated: Object.keys(filtered) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
