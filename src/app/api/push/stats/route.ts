import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'


interface SubscriptionRow {
  user_type: string
}

export async function GET() {
  try {
    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('user_type')
      .eq('is_active', true)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const counts = (data as SubscriptionRow[] ?? []).reduce<Record<string, number>>(
      (acc, row) => {
        const key = row.user_type
        acc[key] = (acc[key] ?? 0) + 1
        return acc
      },
      {}
    )

    return NextResponse.json({
      admin: counts.admin ?? 0,
      worker: counts.worker ?? 0,
      customer: counts.customer ?? 0,
    })
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
