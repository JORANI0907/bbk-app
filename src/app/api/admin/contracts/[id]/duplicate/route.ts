import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { restoreSignaturePlaceholders } from '@/lib/contractTemplate'
import crypto from 'crypto'

type RouteParams = { params: { id: string } }

/**
 * 복제용 스냅샷 정제.
 * 원본 계약서에 첨부됐던 자동 서명/직인 블록·확약 박스·치환된 서명 이미지를
 * 제거하여, 새 초안 계약서에는 다음 서명 흐름에서 다시 새로운 것들이 붙도록 준비한다.
 *
 * 정제 순서:
 * 1) HTML 주석 마커 (BBK_BLOCK_START ~ BBK_BLOCK_END) 사이의 자동 블록 제거
 *    → 앞으로 저장되는 계약서용
 * 2) 마커 없이 저장된 기존 계약서를 위한 텍스트 시그니처 fallback
 *    → "■ 고객 확약 사항", "■ 고객 서명 · 직인", "■ 공급사(범빌드코리아) 서명"
 *      각각의 첫 발견 지점 이전의 가장 가까운 <div 부터 문서 끝까지 잘라냄
 *      (자동 블록은 계약서 하단에만 붙는다는 규약을 이용)
 * 3) 계약서 본문 내에 치환됐던 서명 <img> 를 원본 플레이스홀더로 되돌림
 *    → 새 서명 시 정상적으로 치환됨
 */
function sanitizeSnapshotForDuplicate(html: string): string {
  let sanitized = html

  // 1) 마커 기반 자동 블록 제거
  sanitized = sanitized.replace(
    /<!--\s*BBK_BLOCK_START:[\w-]+\s*-->[\s\S]*?<!--\s*BBK_BLOCK_END:[\w-]+\s*-->/g,
    '',
  )

  // 2) 텍스트 시그니처 fallback (마커 없이 저장된 기존 데이터용)
  const truncateBeforeSignature = (text: string, signature: string): string => {
    const idx = text.indexOf(signature)
    if (idx < 0) return text
    const before = text.slice(0, idx)
    const lastDivStart = before.lastIndexOf('<div')
    return lastDivStart > 0 ? text.slice(0, lastDivStart) : text
  }
  sanitized = truncateBeforeSignature(sanitized, '■ 고객 확약 사항')
  sanitized = truncateBeforeSignature(sanitized, '■ 고객 서명 · 직인')
  sanitized = truncateBeforeSignature(sanitized, '■ 공급사(범빌드코리아) 서명')

  // 3) 서명 이미지(complete 상태 원본) → v2 한글 변수로 복원.
  //    v1 영문 변수가 아니라 v2 로 되돌려야 신규 계약서 흐름(저장/서명/렌더)과 정합.
  //    ⚠️ 공급사 서명 이미지는 alt="공급사 서명"(신규) 또는 alt="관리자 서명"(구버전) 두 형태.
  const altToPlaceholder: Array<[RegExp, string]> = [
    [/<img\b[^>]*\balt="고객 서명"[^>]*\/?>/g,   '{{고객서명}}'],
    [/<img\b[^>]*\balt="서명자 성명"[^>]*\/?>/g, '{{고객성명}}'],
    [/<img\b[^>]*\balt="고객사 직인"[^>]*\/?>/g, '{{고객사직인}}'],
    [/<img\b[^>]*\balt="공급사 서명"[^>]*\/?>/g, '{{공급사서명}}'],
    [/<img\b[^>]*\balt="관리자 서명"[^>]*\/?>/g, '{{공급사서명}}'],
    [/<img\b[^>]*\balt="공급사 직인"[^>]*\/?>/g, '{{공급사직인}}'],
  ]
  for (const [pattern, placeholder] of altToPlaceholder) {
    sanitized = sanitized.replace(pattern, placeholder)
  }

  // 4) draft 상태 원본이면 서명 이미지 대신 dashed <span> 이 있을 수 있음 →
  //    이것도 v2 변수로 복원해 신규 흐름과 정합.
  sanitized = restoreSignaturePlaceholders(sanitized)

  return sanitized.trim()
}

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

  // 스냅샷 정제: 원본에 붙었던 자동 서명 블록·확약 박스·치환된 서명 이미지 제거
  const rawSnapshot = (original.contract_snapshot ?? {}) as Record<string, unknown>
  const rawHtml = typeof rawSnapshot.html === 'string' ? rawSnapshot.html : ''
  const cleanedSnapshot = rawHtml
    ? { ...rawSnapshot, html: sanitizeSnapshotForDuplicate(rawHtml) }
    : rawSnapshot

  const now = Date.now()
  const newRecord = {
    ...rest,
    contract_snapshot: cleanedSnapshot,
    // 생명주기 재설정
    signing_status: 'draft',
    signing_token: crypto.randomUUID(),
    token_expires_at: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
    // 서명/동의 초기화
    customer_signature: null,
    customer_signer_name: null,
    customer_stamp: null,
    customer_agreed_at: null,
    customer_ip: null,
    admin_signature: null,
    supplier_stamp: null,
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
