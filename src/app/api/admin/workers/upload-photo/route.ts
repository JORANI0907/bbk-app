import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = createServiceClient()

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const workerId = formData.get('workerId') as string | null

    if (!file || !workerId) {
      return NextResponse.json({ error: '파일과 직원 ID가 필요합니다.' }, { status: 400 })
    }

    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${workerId}.${ext}`
    const arrayBuffer = await file.arrayBuffer()

    const { error: uploadError } = await supabase.storage
      .from('worker-photos')
      .upload(path, arrayBuffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const { data: urlData } = supabase.storage
      .from('worker-photos')
      .getPublicUrl(path)

    const photoUrl = `${urlData.publicUrl}?t=${Date.now()}`

    const { error: updateError } = await supabase
      .from('workers')
      .update({ photo_url: photoUrl })
      .eq('id', workerId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ photo_url: photoUrl })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '업로드 실패' },
      { status: 500 },
    )
  }
}
