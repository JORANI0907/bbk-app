import { createServiceClient } from '@/lib/supabase/server'
import { sendSlack } from '@/lib/slack'

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

  // Phase 27-AN: 모든 알림 발송에 대해 Slack 통합 로그 (fire-and-forget)
  // 간단 자연어 · 성공/실패 이모지로 구분 · 자동/수동 표기 · 실패는 사유 병기
  try {
    const status = opts.status ?? 'sent'
    const method = opts.method ?? 'auto'
    const emoji = status === 'sent' ? '📱' : '⚠️'
    const suffix = status === 'sent' ? '' : ` · 실패 (${opts.errorMessage ?? '사유 미상'})`
    const who = opts.recipientName ? `${opts.recipientName}` : (opts.recipientPhone ?? '수신자 미상')
    const methodTag = method === 'auto' ? '자동' : '수동'
    sendSlack(`${emoji} ${opts.type} · ${who} · ${methodTag}${suffix}`).catch(() => {})
  } catch { /* Slack 실패는 메인 로직 무관 */ }
}
