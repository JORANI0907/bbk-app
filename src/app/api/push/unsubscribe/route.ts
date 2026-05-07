import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const body = await req.json() as { userId?: string; endpoint?: string }
    const { userId, endpoint } = body

    if (!userId) {
      return NextResponse.json({ error: '유저 ID 필요' }, { status: 400 })
    }

    const supabase = createServiceClient()
    let query = supabase
      .from('push_subscriptions')
      .update({ is_active: false })
      .eq('user_id', userId)

    if (endpoint) {
      query = query.eq('endpoint', endpoint)
    }

    const { error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
