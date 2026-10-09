/**
 * 알림 중앙 발송 함수 (Dispatcher)
 *
 * 모든 알림 발송은 이 함수를 통해 일어남.
 * notification_rules 테이블을 참조해 type별 채널·수신 대상 role을 통제.
 *
 * 사용 예:
 *   await dispatch('결제완료알림', {
 *     customer: { id, userId, phone, name, businessName },
 *     workerIds: [assigned_to],
 *     fallbackText: '[BBK] 결제가 완료되었습니다.',
 *     method: 'auto',
 *   })
 */

import { sendSmsOrLms } from './solapi'
import { notifySlack } from './slack'
import { saveNotificationHistory } from './notification'
import { createServiceClient } from './supabase/server'

export type RecipientRole = 'admin' | 'worker' | 'customer' | 'franchise_hq'

export interface DispatchContext {
  /** 고객 정보 (있으면 SMS 발송 대상) */
  customer?: {
    id?: string
    userId?: string
    phone?: string
    name?: string
    businessName?: string
  }
  /** 작업자 user id 목록 (push 대상) */
  workerIds?: string[]
  /** 관리자 user id 목록 (push 대상) */
  adminIds?: string[]
  /** 본사 user id 목록 (push 대상) */
  franchiseHqIds?: string[]
  /**
   * @deprecated 카카오 알림톡 전환 시 사용하던 변수 맵 — SMS 전환 후 미사용.
   * 기존 호출 코드 호환을 위해 타입은 유지하되 dispatcher 내부에서 무시됨.
   */
  variables?: Record<string, string>
  /** SMS 발송 본문 */
  fallbackText?: string
  /**
   * @deprecated 카카오 알림톡 템플릿 ID — SMS 전환 후 미사용.
   * 기존 호출 코드 호환을 위해 타입은 유지하되 dispatcher 내부에서 무시됨.
   */
  templateIdOverride?: string
  /** Push 알림 메타 */
  push?: { title?: string; body?: string; url?: string }
  /** Slack 알림 메타 */
  slack?: { constructionDate?: string | null }
  /** 발송 방식 — 자동(cron/웹훅) vs 수동(어드민 클릭) */
  method?: 'auto' | 'manual'
  /** notification_history.metadata 기록용 */
  metadata?: Record<string, unknown>
  /**
   * true이면 dispatcher 내부에서 notification_history 저장 건너뜀.
   * 호출자(예: notify/route.ts)가 이미 history를 저장한 경우 중복 저장 및 Slack 이중 경고 방지.
   */
  skipHistory?: boolean
}

export interface DispatchResult {
  type: string
  ruleFound: boolean
  sms: { sent: boolean; reason?: string }
  slack: { sent: boolean }
  history: { saved: boolean }
}

interface NotificationRule {
  type: string
  channel_sms: boolean
  notify_admin: boolean
  notify_customer: boolean
  notify_worker: boolean
  notify_franchise_hq?: boolean
  is_active: boolean
}

/**
 * rule이 DB에 없는 type일 때 적용되는 default.
 */
const DEFAULT_RULE: Omit<NotificationRule, 'type'> = {
  channel_sms: true,
  notify_admin: false,
  notify_customer: true,
  notify_worker: false,
  notify_franchise_hq: false,
  is_active: true,
}

export async function dispatch(type: string, ctx: DispatchContext): Promise<DispatchResult> {
  const result: DispatchResult = {
    type,
    ruleFound: false,
    sms: { sent: false },
    slack: { sent: false },
    history: { saved: false },
  }

  const supabase = createServiceClient()

  // 1. notification_rules 조회 (없으면 DEFAULT_RULE 사용)
  const { data: ruleData } = await supabase
    .from('notification_rules')
    .select('type, channel_sms, notify_admin, notify_customer, notify_worker, is_active')
    .eq('type', type)
    .maybeSingle()

  // notify_franchise_hq는 옵셔널 컬럼
  let franchiseHqEnabled = false
  if (ruleData) {
    const { data: hqCol } = await supabase
      .from('notification_rules')
      .select('notify_franchise_hq')
      .eq('type', type)
      .maybeSingle()
    franchiseHqEnabled = (hqCol as { notify_franchise_hq?: boolean } | null)?.notify_franchise_hq === true
  }

  const rule: NotificationRule = ruleData
    ? { ...(ruleData as unknown as Omit<NotificationRule, 'notify_franchise_hq'>), notify_franchise_hq: franchiseHqEnabled }
    : { type, ...DEFAULT_RULE }

  result.ruleFound = !!ruleData

  if (!rule.is_active) {
    result.sms.reason = 'rule inactive'
    return result
  }

  // 2. SMS/LMS 발송 (customer만)
  //   sendSmsOrLms: 90바이트 초과 시 자동 LMS 승격 + subject 자동 세팅
  //   (기존 sendSMS 는 subject 없이 sendOne 호출 → Solapi 가 LMS 로 처리하면서
  //    subject 누락으로 발송 실패하거나 부분 전달되던 이슈 해결)
  if (rule.channel_sms && rule.notify_customer && ctx.customer?.phone && ctx.fallbackText) {
    try {
      await sendSmsOrLms(ctx.customer.phone, ctx.fallbackText, { subject: `[BBK] ${type}` })
      result.sms.sent = true
    } catch (e) {
      result.sms.reason = e instanceof Error ? e.message : String(e)
    }
  }

  // 3. Slack 알림 (관리 인지용 — 알림 발송 사실을 내부에 공유)
  if (rule.notify_admin) {
    try {
      await notifySlack({
        notifyType: type,
        customerName: ctx.customer?.name ?? '',
        phone: ctx.customer?.phone ?? '',
        businessName: ctx.customer?.businessName ?? '',
        constructionDate: ctx.slack?.constructionDate ?? null,
        method: ctx.method ?? 'auto',
      })
      result.slack.sent = true
    } catch {
      /* Slack 실패는 조용히 무시 */
    }
  }

  // 5. notification_history 기록 — 호출자가 skipHistory: true이면 건너뜀
  // notify/route.ts처럼 SMS를 직접 발송하고 history도 직접 저장하는 호출자는 skipHistory: true를 넘겨
  // dispatcher 내부의 중복 저장(+ Slack 이중 경고)을 방지한다.
  if (!ctx.skipHistory) {
  try {
    const category: 'sms' | 'push' | 'system' =
      result.sms.sent ? 'sms' : 'system'
    const status: 'sent' | 'failed' =
      (result.sms.sent || result.slack.sent) ? 'sent' : 'failed'

    await saveNotificationHistory({
      category,
      type,
      body: `${type} dispatch — sms:${result.sms.sent} slack:${result.slack.sent}`,
      title: type,
      method: ctx.method ?? 'auto',
      recipientType: 'customer',
      recipientId: ctx.customer?.id,
      recipientName: ctx.customer?.name,
      recipientPhone: ctx.customer?.phone,
      metadata: { ...(ctx.metadata ?? {}), ruleFound: result.ruleFound },
      status,
      errorMessage: result.sms.reason,
    })
    result.history.saved = true
  } catch {
    /* history 저장 실패는 조용히 무시 */
  }
  } // end if (!ctx.skipHistory)

  return result
}

/**
 * 헬퍼: 특정 customer.id가 매핑된 franchise_hq.user_id 조회
 * 본사 알림 발송 시 dispatch ctx.franchiseHqIds에 채워줄 때 사용.
 */
export async function lookupFranchiseHqIdsForCustomer(customerId: string): Promise<string[]> {
  try {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('franchise_branch_map')
      .select('franchise_hq:franchise_hq!franchise_branch_map_franchise_hq_id_fkey(user_id)')
      .eq('customer_id', customerId)
    if (!data) return []
    const ids: string[] = []
    for (const row of data as Array<{ franchise_hq: { user_id: string | null } | { user_id: string | null }[] | null }>) {
      const hq = Array.isArray(row.franchise_hq) ? row.franchise_hq[0] : row.franchise_hq
      if (hq?.user_id) ids.push(hq.user_id)
    }
    return ids
  } catch {
    return []
  }
}
