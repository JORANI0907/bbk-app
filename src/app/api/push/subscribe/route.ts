import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      userId?: string
      userType?: string
      endpoint?: string
      p256dh?: string
      auth?: string
      deviceInfo?: Record<string, string>
    }
    const { userId, userType, endpoint, p256dh, auth, deviceInfo } = body

    if (!userId || !userType || !endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: '필수 값 누락' }, { status: 400 })
    }

    const ALLOWED_USER_TYPES = ['admin', 'worker', 'customer']
    if (!ALLOWED_USER_TYPES.includes(userType)) {
      return NextResponse.json({ error: '유효하지 않은 userType' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        user_type: userType,
        endpoint,
        p256dh,
        auth,
        device_info: deviceInfo ?? {},
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,endpoint' }
    )

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
