import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'
import { verifySession } from '@/lib/session'

export async function GET() {
  const cookieStore = cookies()
  const token = cookieStore.get('bbk_session')?.value
  const session = token ? verifySession(token) : null

  if (!session) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .order('category')
    .order('item_name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data })
}
