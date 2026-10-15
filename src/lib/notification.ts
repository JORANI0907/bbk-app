import { createServiceClient } from '@/lib/supabase/server'

interface NotificationHistoryOpts {
  category: 'alimtalk' | 'sms' | 'missed_call' | 'payment' | 'system' | 'push'
  type: string
  body: string
  method?: 'auto' | 'manual'
  recipientType?: 'admin' | 'worker' | 'customer'
  recipientId?: string
  recipientName?: string
  recipientPhone?: string
  title?: string
  metadata?: Record<string, unknown>
  status?: 'sent' | 'failed'
  errorMessage?: string
}

export async function saveNotificationHistory(opts: NotificationHistoryOpts): Promise<void> {
  try {
    const supabase = createServiceClient()
    await supabase.from('notification_history').insert({
      category: opts.category,
      type: opts.type,
      body: opts.body,
      method: opts.method ?? 'auto',
      recipient_type: opts.recipientType,
      recipient_id: opts.recipientId,
      recipient_name: opts.recipientName,
      recipient_phone: opts.recipientPhone,
      title: opts.title,
      metadata: opts.metadata ?? {},
      status: opts.status ?? 'sent',
      error_message: opts.errorMessage,
    })
  } catch (err) {
    // 알림 이력 저장 실패는 메인 로직에 영향 없음
    void err
  }
  // 2026-10-15: 과거 "모든 알림 공통 📱 ... · 자동" Slack 공통 로그 제거.
  // notify/route.ts 가 이미 상세 Slack(📤 알림 발송)을 쏘기 때문에 중복 메시지였음.
}
