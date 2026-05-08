import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase/server'

const BUCKET = 'attendance-photos'
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(request: NextRequest) {
  const session = getServerSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('photo') as File | null
  const type = formData.get('type') as string | null // 'clock_in' | 'clock_out'
  const date = formData.get('date') as string | null

  if (!file || !type || !date) {
    return NextResponse.json({ error: '필수 파라미터 누락 (photo, type, date)' }, { status: 400 })
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: '파일 크기는 10MB 이하여야 합니다.' }, { status: 400 })
  }

  const safeDate = date.replace(/[^0-9-]/g, '_')
  const safeType = type === 'clock_in' ? 'in' : 'out'
  const safeId = String(session.userId ?? 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_')
  const rawExt = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const ext = /^[a-z0-9]+$/.test(rawExt) ? rawExt : 'jpg'
  const fileName = `${safeDate}/${safeId}_${safeType}_${Date.now()}.${ext}`

  try {
    const supabase = createServiceClient()
    const fileBuffer = await file.arrayBuffer()

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, fileBuffer, {
        contentType: file.type || 'image/jpeg',
        upsert: false,
      })

    if (uploadError) {
      return NextResponse.json({ error: `업로드 실패: ${uploadError.message}` }, { status: 500 })
    }

    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(fileName)

    return NextResponse.json({ url: publicUrl })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '업로드 실패' },
      { status: 500 },
    )
  }
}
