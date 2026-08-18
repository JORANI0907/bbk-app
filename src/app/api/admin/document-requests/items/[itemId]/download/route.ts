import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { WORKER_DOCUMENTS_BUCKET } from '@/lib/workerDocuments'

type RouteParams = { params: { itemId: string } }

/**
 * GET /api/admin/document-requests/items/[itemId]/download?mode=view|attachment
 *
 * 관리자가 서류 파일을 열람 or 다운로드.
 * - mode=view (기본): signed URL 로 302 redirect → 브라우저가 이미지/PDF 를 뷰어로 표시
 * - mode=attachment: signed URL 발급 후 서버가 파일을 fetch 하여 Content-Disposition: attachment 로 재전송
 *   → 파일이 항상 다운로드됨
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const supabase = createServiceClient()
  const mode = new URL(request.url).searchParams.get('mode') === 'attachment' ? 'attachment' : 'view'

  const { data: item, error } = await supabase
    .from('worker_document_request_items')
    .select('id, file_path, file_name, file_mime, document_label')
    .eq('id', params.itemId)
    .single()

  if (error || !item) {
    return NextResponse.json({ success: false, error: '파일을 찾을 수 없습니다.' }, { status: 404 })
  }
  if (!item.file_path) {
    return NextResponse.json({ success: false, error: '아직 업로드되지 않은 항목입니다.' }, { status: 404 })
  }

  const filePath = item.file_path as string

  if (mode === 'view') {
    // 1시간짜리 signed URL 발급 후 redirect
    const { data: signed, error: signError } = await supabase.storage
      .from(WORKER_DOCUMENTS_BUCKET)
      .createSignedUrl(filePath, 3600)

    if (signError || !signed?.signedUrl) {
      return NextResponse.json(
        { success: false, error: signError?.message ?? 'signed URL 발급 실패' },
        { status: 500 },
      )
    }
    return NextResponse.redirect(signed.signedUrl, 302)
  }

  // attachment 모드: 파일을 서버에서 fetch 후 다운로드 헤더 붙여 재전송
  const { data: fileData, error: dlError } = await supabase.storage
    .from(WORKER_DOCUMENTS_BUCKET)
    .download(filePath)

  if (dlError || !fileData) {
    return NextResponse.json(
      { success: false, error: dlError?.message ?? '파일 다운로드 실패' },
      { status: 500 },
    )
  }

  const originalName = (item.file_name as string) ?? `${item.document_label ?? 'document'}.bin`
  // RFC 5987 인코딩으로 한글 파일명 안전 전달
  const encoded = encodeURIComponent(originalName)
  const mime = (item.file_mime as string) ?? 'application/octet-stream'

  const arrayBuffer = await fileData.arrayBuffer()
  return new NextResponse(arrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `attachment; filename*=UTF-8''${encoded}`,
      'Content-Length': String(arrayBuffer.byteLength),
      'Cache-Control': 'private, no-store',
    },
  })
}
