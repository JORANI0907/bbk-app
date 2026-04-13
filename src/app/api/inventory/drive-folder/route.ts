import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

const SETTING_KEY = 'inventory_drive_folder'

/** GET: 관리자 + 직원 모두 조회 가능 */
export async function GET() {
  const session = getServerSession()
  if (!session) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', SETTING_KEY)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const folder = data?.value ? JSON.parse(data.value) : null
  return NextResponse.json({ folder })
}

/** PATCH: 관리자만 저장 가능 */
export async function PATCH(request: NextRequest) {
  const session = getServerSession()
  if (!session || session.role !== 'admin')
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await request.json()
  const { folder } = body

  if (!folder?.id || !folder?.name)
    return NextResponse.json({ error: 'folder.id, folder.name은 필수입니다.' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('app_settings')
    .upsert(
      { key: SETTING_KEY, value: JSON.stringify(folder), updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ folder })
}
