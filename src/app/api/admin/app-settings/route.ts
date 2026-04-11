import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

export async function GET(request: NextRequest) {
  const session = getServerSession()
  if (!session || session.role !== 'admin')
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const key = searchParams.get('key')

  if (!key) return NextResponse.json({ error: 'key 파라미터가 필요합니다.' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value, updated_at')
    .eq('key', key)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ setting: data ?? null })
}

export async function PATCH(request: NextRequest) {
  const session = getServerSession()
  if (!session || session.role !== 'admin')
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await request.json()
  const { key, value } = body

  if (!key) return NextResponse.json({ error: 'key는 필수입니다.' }, { status: 400 })
  if (value === undefined) return NextResponse.json({ error: 'value는 필수입니다.' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('app_settings')
    .upsert(
      { key, value, updated_at: new Date().toISOString(), updated_by: session.userId },
      { onConflict: 'key' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ setting: data })
}
