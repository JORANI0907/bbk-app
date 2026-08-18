import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSmsOrLms } from '@/lib/solapi'
import {
  DEFAULT_SMS_TEMPLATE,
  renderSmsBody,
} from '@/lib/workerDocuments'

type RouteParams = { params: { id: string } }

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.bbkorea.co.kr'

interface RequestItemInput {
  document_type: string
  document_label?: string  // is_other 타입일 때만 사용자 입력
}

interface CreateRequestBody {
  items: RequestItemInput[]
  otp_phone: string          // OTP 수신 전화번호
  message_body?: string      // 편집한 SMS 본문 (없으면 기본 템플릿으로 서버 렌더)
}

// GET /api/admin/workers/[id]/document-requests — 이 직원의 요청 이력
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('worker_document_requests')
    .select(`
      id, token, token_expires_at, status, submitted_at, otp_phone, message_body,
      created_at, updated_at,
      worker_document_request_items (
        id, document_type, document_label, file_path, file_name, file_mime,
        file_size, uploaded_at, created_at
      )
    `)
    .eq('worker_id', params.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}

// POST /api/admin/workers/[id]/document-requests — 새 요청 생성 + SMS 발송
export async function POST(request: NextRequest, { params }: RouteParams) {
  const supabase = createServiceClient()

  let body: CreateRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 형식입니다.' }, { status: 400 })
  }

  // 유효성 검증
  if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ success: false, error: '최소 1개 이상의 서류를 선택해주세요.' }, { status: 400 })
  }
  if (!body.otp_phone || body.otp_phone.trim().length < 9) {
    return NextResponse.json({ success: false, error: 'OTP 수신 전화번호를 입력해주세요.' }, { status: 400 })
  }
  // 서류 유형 마스터 조회 (활성 항목만) — 검증 + 라벨 스냅샷 결정에 사용
  const { data: docTypes, error: docTypesErr } = await supabase
    .from('worker_document_types')
    .select('value, label, is_other')
    .eq('is_active', true)
  if (docTypesErr) {
    return NextResponse.json({ success: false, error: docTypesErr.message }, { status: 500 })
  }
  const docTypeMap = new Map<string, { label: string; is_other: boolean }>(
    (docTypes ?? []).map(t => [t.value as string, { label: t.label as string, is_other: !!t.is_other }])
  )

  for (const it of body.items) {
    const def = docTypeMap.get(it.document_type)
    if (!def) {
      return NextResponse.json(
        { success: false, error: `알 수 없는 서류 종류: ${it.document_type}` },
        { status: 400 },
      )
    }
    if (def.is_other && !it.document_label?.trim()) {
      return NextResponse.json(
        { success: false, error: '"기타" 서류는 라벨을 직접 입력해야 합니다.' },
        { status: 400 },
      )
    }
  }

  // 직원 조회
  const { data: worker, error: workerError } = await supabase
    .from('workers')
    .select('id, name, phone')
    .eq('id', params.id)
    .single()

  if (workerError || !worker) {
    return NextResponse.json({ success: false, error: '직원을 찾을 수 없습니다.' }, { status: 404 })
  }

  const normalizedPhone = body.otp_phone.replace(/-/g, '').trim()
  const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  // 요청 마스터 생성 (SMS 본문은 나중에 URL 담아서 계산 후 UPDATE)
  const { data: created, error: insertError } = await supabase
    .from('worker_document_requests')
    .insert({
      worker_id: params.id,
      token_expires_at: tokenExpiresAt,
      otp_phone: normalizedPhone,
      message_body: '(pending render)',
      status: 'pending',
    })
    .select('id, token')
    .single()

  if (insertError || !created) {
    return NextResponse.json(
      { success: false, error: insertError?.message ?? '요청 생성 실패' },
      { status: 500 },
    )
  }

  // 항목 생성 — 라벨은 요청 시점 값으로 스냅샷 저장 (마스터 편집 후에도 이 요청은 원본 라벨 유지)
  const itemRows = body.items.map(it => {
    const def = docTypeMap.get(it.document_type)!
    return {
      request_id: created.id as string,
      document_type: it.document_type,
      document_label: def.is_other
        ? (it.document_label?.trim() ?? '')
        : def.label,
    }
  })
  const { error: itemsError } = await supabase
    .from('worker_document_request_items')
    .insert(itemRows)

  if (itemsError) {
    // 롤백: 마스터 삭제
    await supabase.from('worker_document_requests').delete().eq('id', created.id as string)
    return NextResponse.json({ success: false, error: itemsError.message }, { status: 500 })
  }

  // SMS 본문 렌더링
  const documentList = itemRows.map((it, i) => `${i + 1}. ${it.document_label}`).join('\n')
  const url = `${APP_URL}/worker-documents/${created.token}`
  const workerName = (worker.name as string) || '직원'

  const renderedBody = body.message_body?.trim()
    ? renderSmsBody(body.message_body, { name: workerName, documentList, url })
    : renderSmsBody(DEFAULT_SMS_TEMPLATE, { name: workerName, documentList, url })

  // message_body 를 실제 렌더된 값으로 갱신
  await supabase
    .from('worker_document_requests')
    .update({ message_body: renderedBody })
    .eq('id', created.id as string)

  // SMS 발송 (실패해도 요청은 남김. 관리자가 재발송 or 링크 복사 가능)
  try {
    await sendSmsOrLms(normalizedPhone, renderedBody, { subject: '[BBK] 서류 제출 요청' })
    await supabase.from('notification_history').insert({
      category: 'sms',
      type: '직원서류요청',
      method: 'manual',
      recipient_phone: normalizedPhone,
      recipient_name: workerName,
      body: renderedBody,
      status: 'sent',
      metadata: { worker_id: params.id, request_id: created.id },
    })
  } catch (smsError) {
    const errMsg = smsError instanceof Error ? smsError.message : String(smsError)
    console.error('[worker-documents] SMS 발송 실패', { workerId: params.id, requestId: created.id, error: errMsg })
    await supabase.from('notification_history').insert({
      category: 'sms',
      type: '직원서류요청',
      method: 'manual',
      recipient_phone: normalizedPhone,
      recipient_name: workerName,
      body: renderedBody,
      status: 'failed',
      error_message: errMsg,
      metadata: { worker_id: params.id, request_id: created.id },
    })
    return NextResponse.json(
      {
        success: false,
        error: `요청은 생성됐으나 SMS 발송에 실패했습니다: ${errMsg}. 관리자 페이지에서 링크를 직접 복사해 전달할 수 있습니다.`,
        data: { id: created.id, token: created.token, url },
      },
      { status: 207 },  // partial success
    )
  }

  return NextResponse.json({
    success: true,
    data: { id: created.id, token: created.token, url },
    message: 'SMS가 발송되었습니다.',
  })
}
