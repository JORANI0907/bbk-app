import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

type Params = { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('application_photos')
    .select('*')
    .eq('application_id', params.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ photos: data })
}

// 클라이언트에서 Drive 업로드 후 메타데이터만 DB에 저장
export async function POST(request: NextRequest, { params }: Params) {
  const supabase = createServiceClient()
  const body = await request.json()
  const { drive_file_id, web_view_link, thumbnail_link, photo_type } = body

  if (!drive_file_id || !web_view_link) {
    return NextResponse.json({ error: 'drive_file_id, web_view_link 필수입니다.' }, { status: 400 })
  }

  const { data: photo, error } = await supabase
    .from('application_photos')
    .insert({
      application_id: params.id,
      photo_type: photo_type ?? 'before',
      drive_file_id,
      web_view_link,
      thumbnail_link: thumbnail_link ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ photo })
}
