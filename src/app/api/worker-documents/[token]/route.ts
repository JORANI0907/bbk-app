import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

type RouteParams = { params: { token: string } }

/**
 * GET /api/worker-documents/[token]
 * 직원 업로드 페이지가 초기 로딩 시 호출.
 * 요청 정보 + 요청받은 서류 항목 목록을 반환. OTP·개인정보는 노출하지 않음.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const supabase = createServiceClient()

  const { data: reqData, error } = await supabase
    .from('worker_document_requests')
    .select(`
      id, status, token_expires_at, otp_phone, submitted_at,
      workers ( id, name ),
      worker_document_request_items (
        id, document_type, document_label, uploaded_at
      )
    `)
    .eq('token', params.token)
    .single()

  if (error || !reqData) {
    return NextResponse.json({ success: false, error: '유효하지 않은 링크입니다.' }, { status: 404 })
  }

  if (new Date(reqData.token_expires_at as string) < new Date()) {
    return NextResponse.json({ success: false, error: '링크가 만료되었습니다.' }, { status: 410 })
  }

  if (reqData.status === 'submitted') {
    return NextResponse.json({ success: false, error: '이미 제출이 완료된 요청입니다.' }, { status: 409 })
  }

  const worker = reqData.workers as unknown as { id: string; name: string } | null
  const items = (reqData.worker_document_request_items ?? []) as Array<{
    id: string
    document_type: string
    document_label: string
    uploaded_at: string | null
  }>

  return NextResponse.json({
    success: true,
    data: {
      requestId: reqData.id,
      status: reqData.status,
      workerName: worker?.name ?? '직원',
      // OTP 수신 번호의 마스킹 표시 (예: 010-****-1234)
      otpPhoneMasked: maskPhone(reqData.otp_phone as string),
      items: items.map(it => ({
        id: it.id,
        documentType: it.document_type,
        documentLabel: it.document_label,
        uploaded: it.uploaded_at !== null,
      })),
    },
  })
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 8) return '***'
  const head = digits.slice(0, 3)
  const tail = digits.slice(-4)
  return `${head}-****-${tail}`
}
