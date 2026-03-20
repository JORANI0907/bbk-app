import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

type Params = { params: { id: string; photoId: string } }

// Drive 파일 삭제는 클라이언트 OAuth 토큰이 필요하므로 DB만 삭제
export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('application_photos')
    .delete()
    .eq('id', params.photoId)
    .eq('application_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
