import webpush from 'web-push'
import { createServiceClient } from '@/lib/supabase/server'

if (
  process.env.VAPID_SUBJECT &&
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
  process.env.VAPID_PRIVATE_KEY
) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
}

interface PushSubscriptionRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

export async function sendPushToUsers(
  userIds: string[],
  payload: { title: string; body: string; url?: string }
) {
  if (!userIds.length) return

  const supabase = createServiceClient()
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', userIds)
    .eq('is_active', true)

  if (!subs?.length) return

  const message = JSON.stringify({ ...payload, url: payload.url ?? '/' })

  await Promise.allSettled(
    (subs as PushSubscriptionRow[]).map((sub) =>
      webpush
        .sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          message
        )
        .catch(async (err: { statusCode?: number }) => {
          if (err.statusCode === 410) {
            await supabase
              .from('push_subscriptions')
              .update({ is_active: false })
              .eq('id', sub.id)
          }
        })
    )
  )
}
