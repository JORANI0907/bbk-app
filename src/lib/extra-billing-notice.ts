// 1회성케어 "추가 결제" 안내·완료 문자 (2026-11-08)
//
// 1회성 고객은 예약금·잔금 두 단계만 있었는데, 잔금 이후에 추가 작업비 등을 따로 받을 일이 생긴다.
// 추가 결제는 service_billings 에 billing_type='onetime', service_type='1회성케어' 행으로 저장하고
// (application_id 로 그 시공 건에 묶인다), 문자는 잔금 안내와 같은 흐름으로 보낸다:
//   1) 결제 링크 발급 (비과세 현금 고객은 링크 없이 개인 계좌만 안내)
//   2) 템플릿 '추가결제알림_1회성' / '추가결제알림(현금)_1회성' 으로 발송
//   3) 고객관리 알림이력 + 청구서 발송 기록 + 문자알림관리 이력 저장
// 입금이 확인되면 '추가결제완료알림_1회성' 을 보낸다 (portone-payment-handler 가 호출).

import type { NotificationContext } from './notification-variables'
import { normalizePaymentMethod } from './payment-methods'
import { createServiceClient } from './supabase/server'
import { sendByTemplate } from './template-sender'
import { saveNotificationHistory } from './notification'
import { issueBillingLink } from './billing-link'

type Supabase = ReturnType<typeof createServiceClient>

export const EXTRA_NOTICE_TYPE = '추가결제알림'
export const EXTRA_PAID_TYPE = '추가결제완료알림'

/** 1회성 추가 결제 청구서인지 (정기 고객의 '추가' 청구와 구분) */
export function isExtraBilling(row: { billing_type?: string | null; service_type?: string | null }): boolean {
  return row.billing_type === 'onetime' && row.service_type === '1회성케어'
}

/** 비과세 현금 고객 → 개인 계좌 안내 템플릿, 그 외 → 회사 계좌 + 결제 링크 템플릿 */
export function pickExtraBillingTemplate(paymentMethod: string | null): string {
  return normalizePaymentMethod(paymentMethod) === 'cash_untaxed'
    ? `${EXTRA_NOTICE_TYPE}(현금)_1회성`
    : `${EXTRA_NOTICE_TYPE}_1회성`
}

interface ExtraCustomer {
  id: string
  business_name: string | null
  contact_name: string | null
  contact_phone: string | null
  payment_method: string | null
  account_number: string | null
  drive_folder_url: string | null
}

export interface LoadedExtraBilling {
  id: string
  customer_id: string
  application_id: string | null
  billing_type: string | null
  service_type: string | null
  billing_period: string
  amount: number | null
  due_date: string | null
  notes: string | null
  status: string | null
  payment_url: string | null
  send_attempts: number | null
  customer: ExtraCustomer
}

export async function loadExtraBilling(supabase: Supabase, billingId: string): Promise<LoadedExtraBilling | null> {
  const { data } = await supabase
    .from('service_billings')
    .select(`
      id, customer_id, application_id, billing_type, service_type, billing_period, amount, due_date, notes, status,
      payment_url, send_attempts,
      customers(id, business_name, contact_name, contact_phone, payment_method, account_number, drive_folder_url)
    `)
    .eq('id', billingId)
    .maybeSingle()
  if (!data) return null
  const row = data as unknown as Omit<LoadedExtraBilling, 'customer'> & { customers: ExtraCustomer | null }
  if (!row.customers) return null
  return { ...row, customer: row.customers }
}

function buildContext(b: LoadedExtraBilling, paymentUrl: string | null): NotificationContext {
  return {
    customer: {
      business_name: b.customer.business_name,
      contact_name: b.customer.contact_name,
      contact_phone: b.customer.contact_phone,
      payment_method: b.customer.payment_method,
      account_number: b.customer.account_number,
      drive_folder_url: b.customer.drive_folder_url,
    },
    billing: {
      amount: b.amount,
      notes: b.notes,
      due_date: b.due_date,
      payment_url: paymentUrl,
    },
  }
}

export interface ExtraNoticeOptions {
  method: 'auto' | 'manual'
  /** notification_history.metadata.source — 어디서 보냈는지 */
  source: string
}

export type ExtraNoticeResult =
  | { ok: true; templateCode: string; channel: 'SMS' | 'LMS'; text: string; attemptNo: number; paymentUrl: string | null }
  | { ok: false; reason: 'not_found' | 'not_extra' | 'not_pending' | 'zero_amount' | 'no_phone' | 'send_failed'; message: string }

/** 고객관리 알림이력(customers.notification_log) 맨 앞에 한 줄 추가 */
async function prependCustomerLog(supabase: Supabase, customerId: string, entry: Record<string, unknown>): Promise<void> {
  const { data: custRow } = await supabase.from('customers').select('notification_log').eq('id', customerId).maybeSingle()
  const existLog = Array.isArray(custRow?.notification_log) ? (custRow.notification_log as object[]) : []
  await supabase.from('customers').update({ notification_log: [entry, ...existLog] }).eq('id', customerId)
}

async function recordNoticeSent(
  supabase: Supabase, b: LoadedExtraBilling, phone: string, channel: 'SMS' | 'LMS', text: string,
  attemptNo: number, opts: ExtraNoticeOptions,
): Promise<void> {
  const nowIso = new Date().toISOString()
  await prependCustomerLog(supabase, b.customer.id, {
    type: EXTRA_NOTICE_TYPE, sent_at: nowIso, phone, method: opts.method, channel,
    billing_id: b.id, amount: b.amount, attempt: attemptNo,
  })
  const { error } = await supabase
    .from('service_billings')
    .update({ last_notified_at: nowIso, payment_sent_at: nowIso, send_attempts: attemptNo })
    .eq('id', b.id)
  if (error) console.error('[extra-billing-notice] 발송 기록 저장 실패:', b.id, error.message)
  await saveNotificationHistory({
    category: 'sms', type: EXTRA_NOTICE_TYPE, body: text, method: opts.method,
    recipientType: 'customer', recipientPhone: phone,
    metadata: {
      billing_id: b.id, customer_id: b.customer.id, application_id: b.application_id,
      business_name: b.customer.business_name, amount: b.amount, attempt: attemptNo, channel, source: opts.source,
    },
    status: 'sent',
  })
}

/**
 * 추가 결제 안내 문자 1건 발송 (청구서 생성 직후 자동 + 고객관리 '문자 발송' 버튼 수동).
 *   비과세 현금 고객은 결제 링크를 만들지 않고 개인 계좌만 안내한다.
 */
export async function sendExtraBillingNotice(
  supabase: Supabase, billingId: string, opts: ExtraNoticeOptions,
): Promise<ExtraNoticeResult> {
  const b = await loadExtraBilling(supabase, billingId)
  if (!b) return { ok: false, reason: 'not_found', message: '청구서 또는 고객을 찾을 수 없습니다' }
  if (!isExtraBilling(b)) return { ok: false, reason: 'not_extra', message: '1회성 추가 결제 청구서가 아닙니다' }
  if (b.status !== 'pending') return { ok: false, reason: 'not_pending', message: `청구 상태가 ${b.status ?? '-'} 입니다` }
  if (Number(b.amount ?? 0) <= 0) return { ok: false, reason: 'zero_amount', message: '청구 금액이 0원입니다' }

  const phone = String(b.customer.contact_phone ?? '').replace(/-/g, '')
  if (!phone) return { ok: false, reason: 'no_phone', message: '고객 연락처가 없습니다' }

  const cashOnly = normalizePaymentMethod(b.customer.payment_method) === 'cash_untaxed'
  let paymentUrl = cashOnly ? null : b.payment_url
  if (!cashOnly && !paymentUrl) {
    const link = await issueBillingLink(supabase, b.id)
    if (!link.ok) return { ok: false, reason: 'send_failed', message: `결제 링크 발급 실패: ${link.error}` }
    paymentUrl = link.paymentUrl
  }

  const templateCode = pickExtraBillingTemplate(b.customer.payment_method)
  const result = await sendByTemplate(templateCode, phone, buildContext(b, paymentUrl))
  if (!result.ok) {
    return { ok: false, reason: 'send_failed', message: `${result.reason}${result.details ? `: ${result.details}` : ''}` }
  }
  const attemptNo = Number(b.send_attempts ?? 0) + 1
  await recordNoticeSent(supabase, b, phone, result.type, result.text, attemptNo, opts)
  return { ok: true, templateCode, channel: result.type, text: result.text, attemptNo, paymentUrl }
}

/**
 * 추가 결제 입금 확인 후 고객 완료 문자 ('추가결제완료알림_1회성').
 *   결제 처리(status=paid)는 호출 쪽이 이미 끝낸 상태. 실패해도 결제 처리에는 영향 없다.
 */
export async function sendExtraBillingPaidNotice(supabase: Supabase, billingId: string, paymentId: string): Promise<void> {
  try {
    const b = await loadExtraBilling(supabase, billingId)
    if (!b || !isExtraBilling(b)) return
    const phone = String(b.customer.contact_phone ?? '').replace(/-/g, '')
    if (!phone) return
    const templateCode = `${EXTRA_PAID_TYPE}_1회성`
    const result = await sendByTemplate(templateCode, phone, buildContext(b, b.payment_url))
    if (!result.ok) {
      console.error('[extra-billing-notice] 완료 문자 실패:', billingId, result.reason, result.details ?? '')
      return
    }
    const nowIso = new Date().toISOString()
    await prependCustomerLog(supabase, b.customer.id, {
      type: EXTRA_PAID_TYPE, sent_at: nowIso, phone, method: 'auto', channel: result.type,
      billing_id: b.id, amount: b.amount,
    })
    await saveNotificationHistory({
      category: 'sms', type: EXTRA_PAID_TYPE, body: result.text, method: 'auto',
      recipientType: 'customer', recipientPhone: phone,
      metadata: { billing_id: b.id, customer_id: b.customer.id, application_id: b.application_id, payment_id: paymentId, channel: result.type },
      status: 'sent',
    })
  } catch (e) {
    console.error('[extra-billing-notice] 완료 문자 처리 오류:', e instanceof Error ? e.message : e)
  }
}
