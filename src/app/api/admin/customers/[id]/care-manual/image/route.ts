import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

const BUCKET = 'care-manual-images'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getServerSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: '권한 없음' }, { status: 403 })
    }

    const { id } = await params
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const si = formData.get('si') as string | null
    const ii = formData.get('ii') as string | null

    if (!file) return NextResponse.json({ error: '파일 없음' }, { status: 400 })

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    // ii 있으면 항목 이미지, 없으면 섹션 이미지
    const path = ii !== null
      ? `${id}/s${si ?? '0'}_i${ii}_${Date.now()}.webp`
      : `${id}/s${si ?? '0'}_${Date.now()}.webp`

    const supabase = createServiceClient()
    const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
      contentType: 'image/webp',
      upsert: true,
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return NextResponse.json({ url: data.publicUrl })
  } catch {
    return NextResponse.json({ error: '업로드 실패' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params: _params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getServerSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: '권한 없음' }, { status: 403 })
    }

    const { path } = await req.json() as { path: string }
    if (!path) return NextResponse.json({ error: '경로 없음' }, { status: 400 })

    const supabase = createServiceClient()
    const { error } = await supabase.storage.from(BUCKET).remove([path])

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
  }
}
