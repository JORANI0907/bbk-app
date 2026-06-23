import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'


export async function GET() {
  try {
    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from('push_notification_logs')
      .select('id, title, body, url, status, error_message, sent_at, subscription_id')
      .order('sent_at', { ascending: false })
      .limit(50)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: data ?? [] })
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
