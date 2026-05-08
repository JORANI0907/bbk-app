import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase/server'

const MAX_SIZE = 5 * 1024 * 1024 // 5MB

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', jpe: 'image/jpeg',
  png: 'image/png', gif: 'image/gif', webp: 'image/webp',
}

const ALLOWED_MIME = new Set(Object.values(EXT_MIME))

export async function POST(request: NextRequest) {
  const session = getServerSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: '관리자 전용' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('photo') as File | null
  if (!file) {
    return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: '파일 크기는 5MB 이하여야 합니다.' }, { status: 400 })
  }

  const rawExt = file.name.split('.').pop()?.toLowerCase() ?? ''
  const contentType = EXT_MIME[rawExt] ?? file.type

  if (!ALLOWED_MIME.has(contentType)) {
    return NextResponse.json(
      { error: 'JPG, PNG, GIF, WEBP 형식만 업로드 가능합니다.' },
      { status: 400 }
    )
  }

  const ext = EXT_MIME[rawExt] ? rawExt : 'jpg'
  const rand = Math.random().toString(36).slice(2, 7)
  const fileName = `notice_${Date.now()}_${rand}.${ext}`

  try {
    const supabase = createServiceClient()
    const bytes = await file.arrayBuffer()

    const { error: uploadError } = await supabase.storage
      .from('notices')
      .upload(fileName, bytes, { contentType, upsert: false })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const { data: { publicUrl } } = supabase.storage
      .from('notices')
      .getPublicUrl(fileName)

    return NextResponse.json({ url: publicUrl })
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : '업로드 실패',
    }, { status: 500 })
  }
}
