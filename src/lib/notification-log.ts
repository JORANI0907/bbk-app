import { createServiceClient } from '@/lib/supabase/server'

/**
 * service_applications + customers 양쪽에 알림 이력을 동시 기록.
 * 모든 자동 발송 경로는 이 함수를 사용하면 고객관리 탭 알림이력에 자동 반영됨.
 */
export async function appendBothNotificationLogs(
  supabase: ReturnType<typeof createServiceClient>,
  opts: {
    appId: string
    customerId: string | null | undefined
    existingAppLog: object[]
    entry: object
    extraAppFields?: Record<string, unknown>
  },
): Promise<void> {
  const { appId, customerId, existingAppLog, entry, extraAppFields = {} } = opts

  await supabase
    .from('service_applications')
    .update({ notification_log: [entry, ...existingAppLog], ...extraAppFields })
    .eq('id', appId)

  if (!customerId) return

  const { data: customer } = await supabase
    .from('customers')
    .select('notification_log')
    .eq('id', customerId)
    .single()

  const existingCustomerLog = Array.isArray(customer?.notification_log)
    ? (customer.notification_log as object[])
    : []

  await supabase
    .from('customers')
    .update({ notification_log: [entry, ...existingCustomerLog] })
    .eq('id', customerId)
}
