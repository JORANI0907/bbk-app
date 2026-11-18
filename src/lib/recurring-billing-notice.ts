// 정기(딥/엔드) 결제 안내 SMS — 자동(cron)·수동(고객관리 버튼)·작업완료 즉시 발송 공용
//
// 2026-10-29: 템플릿 선택·변수 채우기 공용화
// 2026-11-01: 실제 발송·이력 기록까지 이 파일로 통합 (sendRecurringBillingNotice)
//   - 발송 직전 결제 링크 자동 발급 → {{잔금결제URL}} 에 들어감
//   - 자동결제 카드(빌링키) 등록 고객은 문자 대신 바로 결제
//   - last_notified_at 은 세계표준시(UTC)로 저장 (날짜 비교는 billing-notify-policy 가 KST 변환)

import type { NotificationContext } from './notification-variables'
import { normalizePaymentMethod } from './payment-methods'
import { createServiceClient } from './supabase/server'
import { sendByTemplate } from './template-sender'
import { saveNotificationHistory } from './notification'
import { issueBillingLink } from './billing-link'
import { chargeBillingWithKey } from './billing-charge'
import { sendSlack } from './slack'
import { todayKstIso } from './billing-notify-policy'

type Supabase = ReturnType<typeof createServiceClient>

/** 자동결제 카드 고객에게 결제 링크 대신 보내는 사전 안내 (2026-11-18) */
export const AUTOPAY_NOTICE_TYPE = '정기결제예정알림'

export interface RecurringBillingCustomer {
  business_name: string | null
  contact_name: string | null
  contact_phone: string | null
  customer_type: string | null
  payment_method: string | null
  account_number: string | null
  /** 등록된 자동결제 카드 표시명 — {{자동결제카드}} */
  billing_key_card_name?: string | null
}

export interface RecurringBillingRow {
  amount: number | null
  due_date: string | null
  payment_url?: string | null
}

/** 비과세 현금 고객 — 결제창(포트원) 대신 개인 계좌를 안내하고 결제 링크를 만들지 않는다 (2026-11-03) */
export function isCashUntaxedCustomer(paymentMethod: string | null): boolean {
  return normalizePaymentMethod(paymentMethod) === 'cash_untaxed'
}

/** 카드 고객 → 정기결제알림(카드)_*, 비과세 현금 → 정기결제알림(현금)_*, 그 외 → 정기결제알림_* */
export function pickRecurringBillingTemplate(customerType: string | null, paymentMethod: string | null): string {
  const suffix = customerType === '정기딥케어' ? '_정기딥' : '_정기엔드'
  // 레거시 한글('카드(온라인 간편결제)')·신규 영문('credit_card') 모두 카드로 인식
  const pm = normalizePaymentMethod(paymentMethod)
  if (pm === 'credit_card') return `정기결제알림(카드)${suffix}`
  if (pm === 'cash_untaxed') return `정기결제알림(현금)${suffix}`
  return `정기결제알림${suffix}`
}

/** 자동결제 카드 고객용 사전 안내 템플릿 — 결제 링크 없이 결제 예정일·금액·카드만 안내 */
export function pickAutopayNoticeTemplate(customerType: string | null): string {
  const suffix = customerType === '정기딥케어' ? '_정기딥' : '_정기엔드'
  return `${AUTOPAY_NOTICE_TYPE}${suffix}`
}

export function hasActiveBillingKey(c: { billing_key: string | null; billing_key_status: string | null }): boolean {
  return !!c.billing_key && c.billing_key_status === 'active'
}

/**
 * 수동 발송(고객관리 버튼)에서 결제 링크 대신 예정 안내를 보내야 하는지.
 *   자동결제 카드가 있고 결제기한이 아직 지나지 않았으면 → 예정 안내 (결제 페이지를 보내지 않는다)
 *   결제기한이 지났으면 → 카드 결제가 실패했을 가능성이 있으므로 기존대로 결제 링크 안내
 */
export function shouldSendAutopayNoticeInstead(
  b: { due_date: string | null; customer: { billing_key: string | null; billing_key_status: string | null } },
  todayIso: string,
): boolean {
  if (!hasActiveBillingKey(b.customer)) return false
  if (!b.due_date) return true
  return todayIso <= b.due_date
}

export function buildRecurringBillingContext(
  cust: RecurringBillingCustomer,
  row: RecurringBillingRow,
): NotificationContext {
  return {
    customer: {
      business_name: cust.business_name,
      contact_name: cust.contact_name,
      contact_phone: cust.contact_phone,
      payment_method: cust.payment_method,
      account_number: cust.account_number,
      billing_amount: row.amount,          // {{계약금액}} 소스
      billing_next_date: row.due_date,     // {{다음결제일}} 소스
      balance_payment_url: row.payment_url ?? null, // {{잔금결제URL}} 소스 — 이 청구서 결제링크
      billing_key_card_name: cust.billing_key_card_name ?? null, // {{자동결제카드}} 소스
    },
  }
}

// ─── 발송 본체 ─────────────────────────────────────────────────────

export interface LoadedBilling {
  id: string
  customer_id: string
  billing_period: string
  amount: number | null
  due_date: string | null
  status: string | null
  payment_url: string | null
  send_attempts: number | null
  /** 자동결제 예정 안내를 보낸 시각 (UTC). 청구서당 1회 */
  autopay_notice_sent_at: string | null
  customer: RecurringBillingCustomer & {
    id: string
    billing_key: string | null
    billing_key_status: string | null
  }
}

export async function loadBillingForNotice(supabase: Supabase, billingId: string): Promise<LoadedBilling | null> {
  const { data } = await supabase
    .from('service_billings')
    .select(`
      id, customer_id, billing_period, amount, due_date, status, payment_url, send_attempts, autopay_notice_sent_at,
      customers(id, business_name, contact_name, contact_phone, customer_type, payment_method, account_number,
                billing_key, billing_key_status, billing_key_card_name)
    `)
    .eq('id', billingId)
    .maybeSingle()
  if (!data) return null
  const row = data as unknown as Omit<LoadedBilling, 'customer'> & { customers: LoadedBilling['customer'] | null }
  if (!row.customers) return null
  return { ...row, customer: row.customers }
}

export interface SendNoticeOptions {
  method: 'auto' | 'manual'
  /** notification_history.metadata.source — 어디서 보냈는지 */
  source: string
  /** 빌링키 있는 고객이면 문자 대신 바로 결제 시도 (기본 true) */
  tryAutoCharge?: boolean
}

export type SendNoticeResult =
  | { ok: true; kind: 'sent'; templateCode: string; channel: 'SMS' | 'LMS'; text: string; attemptNo: number }
  | { ok: true; kind: 'auto_charged'; paymentId: string }
  /** 자동결제 카드 고객 — 결제 링크 대신 "결제 예정일에 등록 카드로 결제됩니다" 안내를 보냈다 */
  | { ok: true; kind: 'autopay_notice'; templateCode: string; channel: 'SMS' | 'LMS'; text: string }
  | { ok: false; reason: 'not_found' | 'not_pending' | 'zero_amount' | 'no_phone' | 'no_billing_key' | 'send_failed'; message: string }

/** 자동결제 예정 안내 발송 기록 — 고객관리 알림이력 + 청구서 1회 표시 + 문자알림관리 이력 */
async function recordAutopayNotice(
  supabase: Supabase,
  b: LoadedBilling,
  phone: string,
  channel: 'SMS' | 'LMS',
  text: string,
  opts: SendNoticeOptions,
): Promise<void> {
  const nowIso = new Date().toISOString()
  const entry = {
    type: AUTOPAY_NOTICE_TYPE, sent_at: nowIso, phone, method: opts.method, channel,
    billing_id: b.id, billing_period: b.billing_period, due_date: b.due_date,
  }
  const { data: custRow } = await supabase.from('customers').select('notification_log').eq('id', b.customer.id).single()
  const existLog = Array.isArray(custRow?.notification_log) ? (custRow.notification_log as object[]) : []
  await supabase.from('customers').update({ notification_log: [entry, ...existLog] }).eq('id', b.customer.id)

  const { error: updErr } = await supabase
    .from('service_billings')
    .update({ autopay_notice_sent_at: nowIso })
    .eq('id', b.id)
  if (updErr) {
    console.error('[recurring-billing-notice] autopay_notice_sent_at 저장 실패:', b.id, updErr.message)
    sendSlack(`⚠️ 자동결제 예정 안내 발송 기록 실패 — ${b.customer.business_name ?? '-'} (${b.billing_period}) 청구 ${b.id}: ${updErr.message}
다음 실행 때 중복 발송될 수 있으니 확인 필요`).catch(() => {})
  }

  await saveNotificationHistory({
    category: 'sms', type: AUTOPAY_NOTICE_TYPE, body: text, method: opts.method,
    recipientType: 'customer', recipientPhone: phone,
    metadata: {
      billing_id: b.id, customer_id: b.customer.id, business_name: b.customer.business_name,
      billing_period: b.billing_period, due_date: b.due_date, channel, source: opts.source,
    },
    status: 'sent',
  })
}

/** 이미 불러온 청구서로 자동결제 예정 안내 발송 (링크 없음, send_attempts 는 건드리지 않는다) */
async function sendAutopayNoticeLoaded(supabase: Supabase, b: LoadedBilling, opts: SendNoticeOptions): Promise<SendNoticeResult> {
  if (!hasActiveBillingKey(b.customer)) return { ok: false, reason: 'no_billing_key', message: '등록된 자동결제 카드가 없습니다' }
  const phone = String(b.customer.contact_phone ?? '').replace(/-/g, '')
  if (!phone) return { ok: false, reason: 'no_phone', message: '고객 연락처가 없습니다' }

  const templateCode = pickAutopayNoticeTemplate(b.customer.customer_type)
  const ctx = buildRecurringBillingContext(b.customer, { amount: b.amount, due_date: b.due_date, payment_url: null })
  const result = await sendByTemplate(templateCode, phone, ctx)
  if (!result.ok) {
    return { ok: false, reason: 'send_failed', message: `${result.reason}${result.details ? `: ${result.details}` : ''}` }
  }
  await recordAutopayNotice(supabase, b, phone, result.type, result.text, opts)
  return { ok: true, kind: 'autopay_notice', templateCode, channel: result.type, text: result.text }
}

/**
 * 자동결제 카드 고객에게 "결제 예정일에 등록 카드로 결제됩니다" 안내 (cron D-3 / 수동 버튼).
 *   결제 페이지 링크를 보내지 않는다. 청구서가 pending 이고 금액이 있어야 한다.
 */
export async function sendAutopayScheduleNotice(
  supabase: Supabase,
  billingId: string,
  opts: SendNoticeOptions,
): Promise<SendNoticeResult> {
  const b = await loadBillingForNotice(supabase, billingId)
  if (!b) return { ok: false, reason: 'not_found', message: '청구서 또는 고객을 찾을 수 없습니다' }
  if (b.status !== 'pending') return { ok: false, reason: 'not_pending', message: `청구 상태가 ${b.status ?? '-'} 입니다` }
  if (Number(b.amount ?? 0) <= 0) return { ok: false, reason: 'zero_amount', message: '청구 금액이 0원입니다' }
  return sendAutopayNoticeLoaded(supabase, b, opts)
}

/** 고객관리 알림이력(customers.notification_log) 맨 앞 + 청구서 발송 카운트 + 문자알림관리 이력 */
async function recordSent(
  supabase: Supabase,
  b: LoadedBilling,
  phone: string,
  channel: 'SMS' | 'LMS',
  text: string,
  attemptNo: number,
  opts: SendNoticeOptions,
): Promise<void> {
  const nowIso = new Date().toISOString()
  const entry = {
    type: '정기결제알림', sent_at: nowIso, phone, method: opts.method, channel,
    billing_id: b.id, billing_period: b.billing_period, attempt: attemptNo,
  }
  const { data: custRow } = await supabase.from('customers').select('notification_log').eq('id', b.customer.id).single()
  const existLog = Array.isArray(custRow?.notification_log) ? (custRow.notification_log as object[]) : []
  await supabase.from('customers').update({ notification_log: [entry, ...existLog] }).eq('id', b.customer.id)

  const { error: updErr } = await supabase
    .from('service_billings')
    .update({ last_notified_at: nowIso, payment_sent_at: nowIso, send_attempts: attemptNo })
    .eq('id', b.id)
  if (updErr) {
    // 문자는 이미 나갔는데 카운트 저장이 실패하면 다음 실행에 중복 발송될 수 있다 → 즉시 알림
    console.error('[recurring-billing-notice] send_attempts 저장 실패:', b.id, updErr.message)
    sendSlack(`⚠️ 정기 결제 안내 발송 기록 실패 — ${b.customer.business_name ?? '-'} (${b.billing_period}) 청구 ${b.id}: ${updErr.message}
다음 실행 때 중복 발송될 수 있으니 확인 필요`).catch(() => {})
  }

  await saveNotificationHistory({
    category: 'sms', type: '정기결제알림', body: text, method: opts.method,
    recipientType: 'customer', recipientPhone: phone,
    metadata: {
      billing_id: b.id, customer_id: b.customer.id, business_name: b.customer.business_name,
      billing_period: b.billing_period, attempt: attemptNo, channel, source: opts.source,
    },
    status: 'sent',
  })
}

/**
 * 청구서 1장에 대한 결제 안내 발송.
 *   1) 빌링키 등록 고객 → 바로 결제 (성공하면 문자 없음)
 *   2) 결제 링크 없으면 발급
 *   3) 템플릿으로 SMS/LMS 발송 + 이력 기록 + send_attempts 증가
 */
export async function sendRecurringBillingNotice(
  supabase: Supabase,
  billingId: string,
  opts: SendNoticeOptions,
): Promise<SendNoticeResult> {
  const b = await loadBillingForNotice(supabase, billingId)
  if (!b) return { ok: false, reason: 'not_found', message: '청구서 또는 고객을 찾을 수 없습니다' }
  if (b.status !== 'pending') return { ok: false, reason: 'not_pending', message: `청구 상태가 ${b.status ?? '-'} 입니다` }
  if (Number(b.amount ?? 0) <= 0) return { ok: false, reason: 'zero_amount', message: '청구 금액이 0원입니다' }

  const tryAutoCharge = opts.tryAutoCharge ?? true
  if (tryAutoCharge && hasActiveBillingKey(b.customer)) {
    const charged = await chargeBillingWithKey(supabase, b.id)
    if (charged.ok) return { ok: true, kind: 'auto_charged', paymentId: charged.paymentId }
    // 실패하면 아래로 내려가 문자 + 링크로 안내 (사유는 customers.payment_status_detail 에 저장됨)
  }
  // 2026-11-18: 결제를 시도하지 않는 수동 발송이라도, 자동결제 카드 고객에게는 결제 페이지를 보내지 않고
  //   결제 예정일 안내만 보낸다 (결제기한이 지난 뒤에는 카드 실패 가능성이 있어 기존대로 링크 안내).
  if (!tryAutoCharge && shouldSendAutopayNoticeInstead(b, todayKstIso())) {
    return sendAutopayNoticeLoaded(supabase, b, opts)
  }

  const phone = String(b.customer.contact_phone ?? '').replace(/-/g, '')
  if (!phone) return { ok: false, reason: 'no_phone', message: '고객 연락처가 없습니다' }

  // 비과세 현금 고객은 결제 링크를 만들지 않는다 (템플릿에 개인 계좌만 안내)
  const cashOnly = isCashUntaxedCustomer(b.customer.payment_method)
  let paymentUrl = cashOnly ? null : b.payment_url
  if (!cashOnly && !paymentUrl) {
    const link = await issueBillingLink(supabase, b.id)
    if (!link.ok) return { ok: false, reason: 'send_failed', message: `결제 링크 발급 실패: ${link.error}` }
    paymentUrl = link.paymentUrl
  }

  const templateCode = pickRecurringBillingTemplate(b.customer.customer_type, b.customer.payment_method)
  const ctx = buildRecurringBillingContext(b.customer, { amount: b.amount, due_date: b.due_date, payment_url: paymentUrl })
  const result = await sendByTemplate(templateCode, phone, ctx)
  if (!result.ok) {
    return { ok: false, reason: 'send_failed', message: `${result.reason}${result.details ? `: ${result.details}` : ''}` }
  }

  const attemptNo = Number(b.send_attempts ?? 0) + 1
  await recordSent(supabase, b, phone, result.type, result.text, attemptNo, opts)
  return { ok: true, kind: 'sent', templateCode, channel: result.type, text: result.text, attemptNo }
}
