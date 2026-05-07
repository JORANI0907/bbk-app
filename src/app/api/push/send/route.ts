import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createServiceClient } from '@/lib/supabase/server'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

interface PushSendPayload {
  userIds?: string[]
  userType?: 'admin' | 'worker' | 'customer'
  title: string
  body: string
  url?: string
}

interface PushSubscriptionRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

interface SendResult {
  id: string
  status: 'sent' | 'failed' | 'expired'
  error?: string
}

export async function POST(req: Request) {
  try {
    const { userIds, userType, title, body, url = '/' } =
      (await req.json()) as PushSendPayload

    if (!title || !body) {
      return NextResponse.json({ error: '제목과 내용은 필수입니다' }, { status: 400 })
    }

    const supabase = createServiceClient()

    let query = supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('is_active', true)

    if (userIds?.length) {
      query = query.in('user_id', userIds)
    }
    if (userType) {
      query = query.eq('user_type', userType)
    }

    const { data: subs, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!subs?.length) return NextResponse.json({ success: true, sent: 0 })

    const payload = JSON.stringify({ title, body, url })

    const results = await Promise.allSettled(
      (subs as PushSubscriptionRow[]).map((sub) =>
        webpush
          .sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          )
          .then((): SendResult => ({ id: sub.id, status: 'sent' }))
          .catch((err: { statusCode?: number; message?: string }): SendResult => ({
            id: sub.id,
            status: err.statusCode === 410 ? 'expired' : 'failed',
            error: err.message,
          }))
      )
    )

    // 만료된 구독 비활성화
    const expiredIds = results
      .filter(
        (r): r is PromiseFulfilledResult<SendResult> =>
          r.status === 'fulfilled' && r.value.status === 'expired'
      )
      .map((r) => r.value.id)

    if (expiredIds.length) {
      await supabase
        .from('push_subscriptions')
        .update({ is_active: false })
        .in('id', expiredIds)
    }

    // 발송 이력 저장
    const logs = results
      .filter((r): r is PromiseFulfilledResult<SendResult> => r.status === 'fulfilled')
      .map((r) => ({
        subscription_id: r.value.id,
        title,
        body,
        url,
        status: r.value.status,
        error_message: r.value.error ?? null,
      }))

    if (logs.length) {
      await supabase.from('push_notification_logs').insert(logs)
    }

    const sent = results.filter(
      (r): r is PromiseFulfilledResult<SendResult> =>
        r.status === 'fulfilled' && r.value.status === 'sent'
    ).length

    return NextResponse.json({ success: true, sent, total: subs.length })
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
