import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// Make 시나리오가 구글 드라이브 폴더 생성 후 호출하는 콜백 엔드포인트
export async function POST(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()
  const { application_id, drive_folder_url } = body

  if (!application_id || !drive_folder_url) {
    return NextResponse.json({ error: 'application_id와 drive_folder_url이 필요합니다.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('service_applications')
    .update({ drive_folder_url })
    .eq('id', application_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
