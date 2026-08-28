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
import { sendPushToUsers } from './push'
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
}

export interface DispatchResult {
  type: string
  ruleFound: boolean
  sms: { sent: boolean; reason?: string }
  push: { sent: boolean; targets: number; reason?: string }
  slack: { sent: boolean }
  history: { saved: boolean }
}

interface NotificationRule {
  type: string
  channel_sms: boolean
  channel_push: boolean
  channel_in_app: boolean
  notify_admin: boolean
  notify_customer: boolean
  notify_worker: boolean
  notify_franchise_hq?: boolean
  is_active: boolean
}

/**
 * rule이 DB에 없는 type일 때 적용되는 default.
 * 기존 코드 동작을 깨지 않도록 보수적으로 설정 — SMS+push 활성, customer만 수신.
 * 운영자가 notification_rules에 row를 추가하면 이 default를 덮어쓸 수 있음.
 */
const DEFAULT_RULE: Omit<NotificationRule, 'type'> = {
  channel_sms: true,
  channel_push: true,
  channel_in_app: true,
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
    push: { sent: false, targets: 0 },
    slack: { sent: false },
    history: { saved: false },
  }

  const supabase = createServiceClient()

  // 1. notification_rules 조회 (없으면 DEFAULT_RULE 사용)
  const { data: ruleData } = await supabase
    .from('notification_rules')
    .select(
      'type, channel_sms, channel_push, channel_in_app, ' +
      'notify_admin, notify_customer, notify_worker, is_active'
    )
    .eq('type', type)
    .maybeSingle()

  // notify_franchise_hq는 Phase 3에서 추가 — 조회 시 옵셔널
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
    result.push.reason = 'rule inactive'
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

  // 3. Push 발송 - role별 user id 수집
  if (rule.channel_push) {
    const pushTargets = new Set<string>()
    if (rule.notify_customer && ctx.customer?.userId) pushTargets.add(ctx.customer.userId)
    if (rule.notify_worker && ctx.workerIds) ctx.workerIds.forEach((id) => pushTargets.add(id))
    if (rule.notify_franchise_hq && ctx.franchiseHqIds) ctx.franchiseHqIds.forEach((id) => pushTargets.add(id))

    // notify_admin: 호출자가 ctx.adminIds(담당 관리자 id)를 전달한 경우에만 push
    // 미전달 시 push 안 함 — 각 고객의 담당 관리자만 알림 받도록 보장
    // (customers.assigned_user_id를 호출자가 명시적으로 전달해야 함)
    if (rule.notify_admin && ctx.adminIds?.length) {
      ctx.adminIds.forEach((id) => pushTargets.add(id))
    }

    if (pushTargets.size > 0) {
      const targetArr = Array.from(pushTargets)
      try {
        await sendPushToUsers(targetArr, {
          title: ctx.push?.title ?? `BBK 공간케어 — ${type}`,
          body: ctx.push?.body ?? type,
          url: ctx.push?.url,
        })
        result.push.sent = true
        result.push.targets = targetArr.length
      } catch (e) {
        result.push.reason = e instanceof Error ? e.message : String(e)
      }
    } else {
      result.push.reason = 'no targets after role filter'
    }
  }

  // 4. Slack 알림 (관리 인지용 — 알림 발송 사실을 내부에 공유)
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

  // 5. notification_history 기록 (성공/실패 모두)
  try {
    const category: 'sms' | 'push' | 'system' =
      result.sms.sent ? 'sms' : result.push.sent ? 'push' : 'system'
    const status: 'sent' | 'failed' =
      (result.sms.sent || result.push.sent || result.slack.sent) ? 'sent' : 'failed'

    await saveNotificationHistory({
      category,
      type,
      body: `${type} dispatch — sms:${result.sms.sent} push:${result.push.targets} slack:${result.slack.sent}`,
      title: type,
      method: ctx.method ?? 'auto',
      recipientType: 'customer',
      recipientId: ctx.customer?.id,
      recipientName: ctx.customer?.name,
      recipientPhone: ctx.customer?.phone,
      metadata: { ...(ctx.metadata ?? {}), ruleFound: result.ruleFound },
      status,
      errorMessage: result.sms.reason ?? result.push.reason,
    })
    result.history.saved = true
  } catch {
    /* history 저장 실패는 조용히 무시 */
  }

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
