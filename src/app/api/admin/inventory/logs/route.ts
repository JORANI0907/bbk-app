import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'
import { verifySession } from '@/lib/session'

export async function GET(request: NextRequest) {
  const cookieStore = cookies()
  const token = cookieStore.get('bbk_session')?.value
  const session = token ? verifySession(token) : null

  if (!session) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const inventoryId = searchParams.get('inventory_id')

  if (!inventoryId) {
    return NextResponse.json({ error: 'inventory_id 필요' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Try with optional columns first
  try {
    const { data, error } = await supabase
      .from('inventory_logs')
      .select('id, inventory_id, worker_id, change_type, quantity, note, created_at, photo_url, worker_name')
      .eq('inventory_id', inventoryId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      if (error.message?.includes('column') || error.code === '42703') {
        // Fallback without optional columns
        const { data: d2, error: e2 } = await supabase
          .from('inventory_logs')
          .select('id, inventory_id, worker_id, change_type, quantity, note, created_at')
          .eq('inventory_id', inventoryId)
          .order('created_at', { ascending: false })
          .limit(20)

        if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
        return NextResponse.json({ logs: d2 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ logs: data })
  } catch {
    return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  }
}
