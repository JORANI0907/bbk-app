import { createServiceClient } from '@/lib/supabase/server'

export type NotificationType =
  | 'schedule_confirmed'
  | 'work_completed'
  | 'schedule_change_approved'
  | 'schedule_change_rejected'
  | 'notice_created'

interface CreateInAppNotificationParams {
  customerId: string
  userId: string
  type: NotificationType
  title: string
  body: string
  actionUrl?: string
  metadata?: Record<string, unknown>
}

export async function createInAppNotification(
  params: CreateInAppNotificationParams,
): Promise<void> {
  try {
    const supabase = createServiceClient()
    await supabase.from('in_app_notifications').insert({
      customer_id: params.customerId,
      user_id: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      action_url: params.actionUrl ?? null,
      metadata: params.metadata ?? {},
    })
  } catch {
    // 알림 실패가 메인 로직에 영향 없도록 조용히 처리
  }
}

interface CustomerUserRow {
  id: string
  user_id: string | null
}

/**
 * 활성 고객 전원에게 인앱 알림 배치 발송
 * notices_created 등 브로드캐스트 용도
 */
export async function broadcastInAppNotification(params: {
  type: NotificationType
  title: string
  body: string
  actionUrl?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    const supabase = createServiceClient()

    const { data: customers } = await supabase
      .from('customers')
      .select('id, user_id')
      .is('deleted_at', null)
      .not('user_id', 'is', null)

    if (!customers || customers.length === 0) return

    const rows = (customers as CustomerUserRow[])
      .filter((c) => c.user_id !== null)
      .map((c) => ({
        customer_id: c.id,
        user_id: c.user_id as string,
        type: params.type,
        title: params.title,
        body: params.body,
        action_url: params.actionUrl ?? null,
        metadata: params.metadata ?? {},
      }))

    if (rows.length === 0) return

    // 배치 insert (최대 500건씩)
    const BATCH = 500
    for (let i = 0; i < rows.length; i += BATCH) {
      await supabase.from('in_app_notifications').insert(rows.slice(i, i + BATCH))
    }
  } catch {
    // 브로드캐스트 실패가 메인 로직에 영향 없도록 조용히 처리
  }
}
