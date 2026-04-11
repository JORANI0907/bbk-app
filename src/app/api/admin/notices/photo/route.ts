// 공지사항 사진 업로드 → Supabase Storage 'notices' 버킷 사용
// Supabase 대시보드 → Storage → 'notices' 버킷 생성(Public) 필요
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase/server'

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

  try {
    const supabase = createServiceClient()
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const fileName = `notice_${Date.now()}.${ext}`
    const bytes = await file.arrayBuffer()

    const { error: uploadError } = await supabase.storage
      .from('notices')
      .upload(fileName, bytes, {
        contentType: file.type || 'image/jpeg',
        upsert: false,
      })

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
