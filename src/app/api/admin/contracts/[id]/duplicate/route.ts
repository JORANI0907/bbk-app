import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import crypto from 'crypto'

type RouteParams = { params: { id: string } }

/**
 * POST /api/admin/contracts/[id]/duplicate
 * 원본 계약서를 완전히 별개의 새 초안(draft)으로 복제한다.
 * 상태(draft/pending/signed/completed/voided)와 무관하게 복제 가능.
 *
 * - customer_id, template_id, contract_snapshot, 기간·플랜·품목 등 계약 내용은 그대로 승계
 * - 서명·식별·생명주기 필드는 초기화 (새 초안이므로)
 * - signing_token 은 새 UUID 로 재발급 (원본과 링크 공유 방지)
 * - application_id 는 null (원본 신청건과의 연결은 끊음)
 * - 삭제된(deleted_at != null) 계약서도 복제 가능
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const supabase = createServiceClient()

  const { data: original, error: fetchError } = await supabase
    .from('contracts')
    .select('*')
    .eq('id', params.id)
    .single()

  if (fetchError || !original) {
    return NextResponse.json(
      { success: false, error: '원본 계약서를 찾을 수 없습니다.' },
      { status: 404 },
    )
  }

  // DB 가 자동 생성/관리하는 필드는 제외
  const {
    id: _id,
    created_at: _createdAt,
    updated_at: _updatedAt,
    ...rest
  } = original as Record<string, unknown>

  const now = Date.now()
  const newRecord = {
    ...rest,
    // 생명주기 재설정
    signing_status: 'draft',
    signing_token: crypto.randomUUID(),
    token_expires_at: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
    // 서명/동의 초기화
    customer_signature: null,
    customer_signer_name: null,
    customer_agreed_at: null,
    customer_ip: null,
    admin_signature: null,
    admin_signed_at: null,
    signed_pdf_url: null,
    article8_agree: null,
    article14_agree: null,
    // 파기/삭제 상태 초기화
    voided_at: null,
    void_reason: null,
    deleted_at: null,
    // 원본 신청건과 연결 끊기
    application_id: null,
  }

  const { data: created, error: insertError } = await supabase
    .from('contracts')
    .insert(newRecord)
    .select('id')
    .single()

  if (insertError) {
    return NextResponse.json(
      { success: false, error: insertError.message },
      { status: 500 },
    )
  }

  return NextResponse.json({ success: true, data: created }, { status: 201 })
}
