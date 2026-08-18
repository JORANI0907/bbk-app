import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { otpStore } from '@/lib/otp-store'
import { sendSlack } from '@/lib/slack'
import {
  WORKER_DOCUMENTS_BUCKET,
  MAX_FILE_SIZE_BYTES,
  buildStoragePath,
  isAllowedExtension,
  isAllowedMime,
  type WorkerDocumentType,
} from '@/lib/workerDocuments'

type RouteParams = { params: { token: string } }

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  )
}

/**
 * POST /api/worker-documents/[token]/submit
 * multipart/form-data:
 *   - otp: string (6자리)
 *   - file_<itemId>: File (각 항목당 하나)
 *
 * 모든 요청 항목에 대응하는 파일이 있어야 성공. 하나라도 빠지면 400.
 * 성공 시 status='submitted' 로 전환.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const supabase = createServiceClient()

  const { data: reqData, error: reqError } = await supabase
    .from('worker_document_requests')
    .select(`
      id, status, token_expires_at, otp_code, otp_expires_at, otp_phone,
      worker_id,
      worker_document_request_items ( id, document_type, uploaded_at )
    `)
    .eq('token', params.token)
    .single()

  if (reqError || !reqData) {
    return NextResponse.json({ success: false, error: '유효하지 않은 링크입니다.' }, { status: 404 })
  }
  if (new Date(reqData.token_expires_at as string) < new Date()) {
    return NextResponse.json({ success: false, error: '링크가 만료되었습니다.' }, { status: 410 })
  }
  if (reqData.status === 'submitted') {
    return NextResponse.json({ success: false, error: '이미 제출된 요청입니다.' }, { status: 409 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 형식입니다.' }, { status: 400 })
  }

  // OTP 검증
  const otp = String(formData.get('otp') ?? '').trim()
  if (!otp || otp.length !== 6) {
    return NextResponse.json({ success: false, error: '6자리 인증번호를 입력해주세요.' }, { status: 400 })
  }
  const phone = (reqData.otp_phone as string).replace(/-/g, '')
  let otpValid = false
  const memResult = otpStore.verify(phone, otp)
  if (memResult.success) {
    otpValid = true
  } else {
    const dbOtp = reqData.otp_code as string | null
    const dbExpires = reqData.otp_expires_at as string | null
    if (dbOtp && dbExpires && dbOtp === otp && new Date(dbExpires) > new Date()) {
      otpValid = true
    }
  }
  if (!otpValid) {
    return NextResponse.json(
      { success: false, error: memResult.error ?? '인증번호가 올바르지 않습니다.' },
      { status: 400 },
    )
  }

  // 모든 항목에 대응하는 파일 있는지 검증
  const items = (reqData.worker_document_request_items ?? []) as Array<{
    id: string
    document_type: string
    uploaded_at: string | null
  }>
  if (items.length === 0) {
    return NextResponse.json({ success: false, error: '요청 항목이 없습니다.' }, { status: 400 })
  }

  const uploads: Array<{ itemId: string; file: File; documentType: WorkerDocumentType }> = []
  for (const it of items) {
    const key = `file_${it.id}`
    const value = formData.get(key)
    if (!(value instanceof File) || value.size === 0) {
      return NextResponse.json(
        { success: false, error: `모든 서류 항목의 파일을 업로드해주세요. (누락: ${it.document_type})` },
        { status: 400 },
      )
    }
    if (value.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: `파일 크기가 10MB 를 초과합니다. (${it.document_type})` },
        { status: 400 },
      )
    }
    if (!isAllowedExtension(value.name) || !isAllowedMime(value.type)) {
      return NextResponse.json(
        { success: false, error: `허용되지 않는 파일 형식입니다. (${it.document_type})` },
        { status: 400 },
      )
    }
    uploads.push({ itemId: it.id, file: value, documentType: it.document_type as WorkerDocumentType })
  }

  const workerId = reqData.worker_id as string
  const requestId = reqData.id as string
  const now = new Date().toISOString()
  const clientIp = getClientIp(request)

  // 하나씩 업로드 (실패 시 이미 올린 것은 롤백)
  const uploadedPaths: string[] = []
  try {
    for (const up of uploads) {
      const path = buildStoragePath({
        workerId,
        requestId,
        documentType: up.documentType,
        originalFileName: up.file.name,
      })
      const arrayBuffer = await up.file.arrayBuffer()
      const { error: upErr } = await supabase.storage
        .from(WORKER_DOCUMENTS_BUCKET)
        .upload(path, arrayBuffer, {
          contentType: up.file.type,
          upsert: false,
        })
      if (upErr) throw new Error(`Storage 업로드 실패: ${upErr.message}`)

      uploadedPaths.push(path)

      const { error: itemUpdErr } = await supabase
        .from('worker_document_request_items')
        .update({
          file_path: path,
          file_name: up.file.name,
          file_mime: up.file.type,
          file_size: up.file.size,
          uploaded_at: now,
        })
        .eq('id', up.itemId)
      if (itemUpdErr) throw new Error(`항목 갱신 실패: ${itemUpdErr.message}`)
    }
  } catch (e) {
    // 롤백: 이미 올린 파일 삭제 + 항목 초기화
    if (uploadedPaths.length > 0) {
      await supabase.storage.from(WORKER_DOCUMENTS_BUCKET).remove(uploadedPaths).catch(() => {})
      await supabase
        .from('worker_document_request_items')
        .update({ file_path: null, file_name: null, file_mime: null, file_size: null, uploaded_at: null })
        .in('id', uploads.map(u => u.itemId))
    }
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[worker-documents/submit] 업로드 실패', { requestId, error: msg })
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }

  // 요청 상태 완료로 전환
  await supabase
    .from('worker_document_requests')
    .update({
      status: 'submitted',
      submitted_at: now,
      submitted_ip: clientIp,
      otp_verified_at: now,
      otp_code: null,
      otp_expires_at: null,
    })
    .eq('id', requestId)

  // 관리자 Slack 알림
  const { data: worker } = await supabase
    .from('workers')
    .select('name')
    .eq('id', workerId)
    .single()
  const workerName = (worker?.name as string) ?? '직원'
  await sendSlack(`📎 *직원 서류 제출 완료* | ${workerName} | ${uploads.length}개 항목`)

  return NextResponse.json({ success: true, message: '서류 제출이 완료되었습니다.' })
}
