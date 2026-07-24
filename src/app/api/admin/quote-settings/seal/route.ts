import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })
    // 클라이언트에서 자동 축소해서 업로드하지만, 원본이 매우 큰 경우 대비 10MB 안전판
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: '10MB 이하 파일만 허용됩니다.' }, { status: 400 })

    const validTypes = ['image/png', 'image/jpeg', 'image/webp']
    if (!validTypes.includes(file.type)) {
      return NextResponse.json({ error: 'PNG, JPG, WEBP만 허용됩니다.' }, { status: 400 })
    }

    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/jpeg' ? 'jpg' : 'webp'
    const fileName = `seal/company-seal.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const supabase = createServiceClient()

    const { error: uploadError } = await supabase.storage
      .from('quote-pdfs')
      .upload(fileName, buffer, { contentType: file.type, upsert: true })

    if (uploadError) throw new Error(uploadError.message)

    const { data: urlData } = supabase.storage.from('quote-pdfs').getPublicUrl(fileName)

    const { error: dbError } = await supabase.from('quote_settings').upsert({
      id: 'default',
      seal_image_url: urlData.publicUrl,
      updated_at: new Date().toISOString(),
    })

    if (dbError) throw new Error(dbError.message)

    return NextResponse.json({ success: true, seal_url: urlData.publicUrl })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '업로드 실패' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const supabase = createServiceClient()

    await supabase.storage.from('quote-pdfs').remove([
      'seal/company-seal.png',
      'seal/company-seal.jpg',
      'seal/company-seal.webp',
    ])

    const { error } = await supabase
      .from('quote_settings')
      .update({ seal_image_url: null, updated_at: new Date().toISOString() })
      .eq('id', 'default')

    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '삭제 실패' }, { status: 500 })
  }
}
