import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  const session = getServerSession()
  if (!session || session.role !== 'worker' && session.role !== 'admin') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const scheduleId = formData.get('scheduleId') as string | null
  const photoType = formData.get('photoType') as string | null

  if (!file || !scheduleId || !photoType) {
    return NextResponse.json({ error: '필수 값이 누락되었습니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase()
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ._-]/g, '_')
  const path = `${sanitize(scheduleId)}/${sanitize(photoType)}_${Date.now()}.${ext}`

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const { error: uploadError } = await supabase.storage
    .from('work-photos')
    .upload(path, buffer, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('work-photos').getPublicUrl(path)

  await supabase.from('work_photos').insert({
    schedule_id: scheduleId,
    photo_type: photoType,
    storage_path: path,
    photo_url: publicUrl,
    taken_at: new Date().toISOString(),
  })

  return NextResponse.json({ photoUrl: publicUrl })
}
