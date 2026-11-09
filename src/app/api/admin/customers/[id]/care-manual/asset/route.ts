import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { ASSET_KINDS } from '@/types/care-manual'

// Vercel Fluid Compute (payload 4.5MB → 무제한). 파일 업로드 route 표준 설정.
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * 케어매뉴얼 자료함 업로드 (2026-11-08) — 도면·건축물대장·참고사진 (PDF·이미지)
 *   POST   form: file, kind(도면/건축물대장/참고사진/기타)  → { url, mime, size }
 *   DELETE json: { path }
 *   관리자 전용. 파일은 care-manual-images 버킷의 {고객id}/assets/ 아래.
 *   공개 버킷이라 주소를 아는 사람은 볼 수 있다 — 주소에 랜덤 문자열을 넣어 추측을 막는다.
 */
const BUCKET = 'care-manual-images'
const MAX_BYTES = 25 * 1024 * 1024
const ALLOWED_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
}
const KIND_VALUES: readonly string[] = ASSET_KINDS.map(k => k.value)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const fail = (message: string, status: number) => NextResponse.json({ error: message }, { status })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getServerSession()
    if (!session || session.role !== 'admin') return fail('권한 없음', 403)
    const { id } = await params
    if (!UUID_RE.test(id)) return fail('잘못된 고객 id', 400)

    const form = await req.formData()
    const file = form.get('file')
    const kind = form.get('kind')
    if (!(file instanceof File)) return fail('파일이 없습니다', 400)
    if (typeof kind !== 'string' || !KIND_VALUES.includes(kind)) return fail('자료 종류가 올바르지 않습니다', 400)
    const ext = ALLOWED_MIME[file.type]
    if (!ext) return fail('PDF 또는 이미지(JPG·PNG·WEBP·HEIC)만 올릴 수 있습니다', 400)
    if (file.size > MAX_BYTES) return fail('파일은 25MB 이하여야 합니다', 400)

    const rand = crypto.randomUUID().slice(0, 8)
    const path = `${id}/assets/${kind}_${Date.now()}_${rand}.${ext}`
    const supabase = createServiceClient()
    const { error } = await supabase.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: false,
    })
    if (error) {
      console.error('[care-manual/asset] 업로드 실패:', error.message)
      // 저장소(버킷) 설정이 막은 경우는 원인을 알려준다 — 2026-11-08 PDF 거부 사례
      if (/mime/i.test(error.message)) return fail('저장소가 이 파일 형식을 허용하지 않습니다. 관리자에게 버킷 설정 확인을 요청하세요.', 415)
      if (/size|exceed|too large/i.test(error.message)) return fail('저장소 용량 제한을 넘었습니다. 파일을 줄여 다시 올려주세요.', 413)
      return fail('파일을 올리지 못했습니다', 500)
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return NextResponse.json({ url: data.publicUrl, mime: file.type, size: file.size })
  } catch (e) {
    console.error('[care-manual/asset] POST 오류:', e instanceof Error ? e.message : e)
    return fail('파일을 올리지 못했습니다', 500)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getServerSession()
    if (!session || session.role !== 'admin') return fail('권한 없음', 403)
    const { id } = await params
    const { path } = await req.json().catch(() => ({})) as { path?: unknown }
    // 이 고객의 assets 폴더 안 파일만 지울 수 있다
    if (typeof path !== 'string' || !path.startsWith(`${id}/assets/`) || path.includes('..')) return fail('경로가 올바르지 않습니다', 400)
    const supabase = createServiceClient()
    const { error } = await supabase.storage.from(BUCKET).remove([path])
    if (error) {
      console.error('[care-manual/asset] 삭제 실패:', error.message)
      return fail('파일을 지우지 못했습니다', 500)
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[care-manual/asset] DELETE 오류:', e instanceof Error ? e.message : e)
    return fail('파일을 지우지 못했습니다', 500)
  }
}
