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

type Supabase = ReturnType<typeof createServiceClient>

export interface RecurringBillingCustomer {
  business_name: string | null
  contact_name: string | null
  contact_phone: string | null
  customer_type: string | null
  payment_method: string | null
  account_number: string | null
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
      id, customer_id, billing_period, amount, due_date, status, payment_url, send_attempts,
      customers(id, business_name, contact_name, contact_phone, customer_type, payment_method, account_number,
                billing_key, billing_key_status)
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
  | { ok: false; reason: 'not_found' | 'not_pending' | 'zero_amount' | 'no_phone' | 'send_failed'; message: string }

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

  if ((opts.tryAutoCharge ?? true) && b.customer.billing_key && b.customer.billing_key_status === 'active') {
    const charged = await chargeBillingWithKey(supabase, b.id)
    if (charged.ok) return { ok: true, kind: 'auto_charged', paymentId: charged.paymentId }
    // 실패하면 아래로 내려가 문자 + 링크로 안내 (사유는 customers.payment_status_detail 에 저장됨)
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
