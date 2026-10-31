/**
 * 건별(per_visit) 청구서 생성·활성화 (2026-11-01)
 *
 * 결제 기준이 '시공 1건마다'인 정기 고객은 시공 건(service_applications)이 '작업완료'로 바뀌는 순간
 *   1) 그 달 청구서가 미리 만들어져 있으면 → 그 청구서에 시공 건을 연결하고 알림 시작일을 채운다
 *   2) 없으면 → 청구서를 새로 만든다
 *   3) 후불이면 바로 결제 안내 발송 (빌링키 고객은 바로 결제)
 *
 * 호출 지점: 신청서 PATCH, 알림 발송 API(작업완료알림), 일정 알림 웹훅 — progress_status 가 '작업완료'로 바뀔 때.
 * 몇 번 불려도 안전(멱등): application_id 로 이미 연결된 청구서가 있으면 다시 만들지 않는다.
 */

import { createServiceClient } from '@/lib/supabase/server'
import { computeBillingAmountFromCustomer } from '@/lib/billing-generator'
import { computeNotifyStartDate, todayKstIso, type BillingTiming } from '@/lib/billing-notify-policy'
import { sendRecurringBillingNotice } from '@/lib/recurring-billing-notice'

type Supabase = ReturnType<typeof createServiceClient>

const REGULAR_TYPES = new Set(['정기딥케어', '정기엔드케어'])

export type ActivateResult =
  | { ok: true; billingId: string; created: boolean; notified: 'sent' | 'auto_charged' | 'none' }
  | { ok: false; skipped: 'not_completed' | 'no_customer' | 'not_per_visit' | 'paused' | 'zero_amount' | 'already_linked' | 'already_paid' | 'error'; message: string }

interface AppRow {
  id: string
  customer_id: string | null
  construction_date: string | null
  progress_status: string | null
  service_type: string | null
}

interface CustRow {
  id: string
  customer_type: string | null
  billing_trigger: string | null
  billing_timing: BillingTiming | null
  status: string | null
  auto_notification_paused: boolean | null
  supply_amount: number | null
  vat: number | null
  billing_amount: number | null
  payment_method: string | null
}

interface ExistingBilling {
  id: string
  status: string | null
  application_id: string | null
  billing_period: string
}

async function findBillingsForPeriod(supabase: Supabase, customerId: string, period: string): Promise<ExistingBilling[]> {
  const { data } = await supabase
    .from('service_billings')
    .select('id, status, application_id, billing_period')
    .eq('customer_id', customerId)
    .eq('billing_period', period)
  return (data ?? []) as ExistingBilling[]
}

/**
 * 시공 건 1개를 청구서로 연결/생성. opts.sendNow=false 면 알림은 보내지 않는다.
 */
export async function activatePerVisitBilling(
  supabase: Supabase,
  applicationId: string,
  opts: { sendNow?: boolean; source?: string } = {},
): Promise<ActivateResult> {
  const sendNow = opts.sendNow ?? true
  const source = opts.source ?? 'per-visit-billing'

  const { data: appRaw } = await supabase
    .from('service_applications')
    .select('id, customer_id, construction_date, progress_status, service_type')
    .eq('id', applicationId)
    .is('deleted_at', null)
    .maybeSingle()
  const app = appRaw as AppRow | null
  if (!app || app.progress_status !== '작업완료') return { ok: false, skipped: 'not_completed', message: '작업완료 상태가 아닙니다' }
  if (!app.customer_id) return { ok: false, skipped: 'no_customer', message: '연결된 고객이 없습니다' }

  const { data: custRaw } = await supabase
    .from('customers')
    .select('id, customer_type, billing_trigger, billing_timing, status, auto_notification_paused, supply_amount, vat, billing_amount, payment_method')
    .eq('id', app.customer_id)
    .is('deleted_at', null)
    .maybeSingle()
  const cust = custRaw as CustRow | null
  if (!cust || !REGULAR_TYPES.has(cust.customer_type ?? '') || cust.billing_trigger !== 'per_visit') {
    return { ok: false, skipped: 'not_per_visit', message: '건별 결제 고객이 아닙니다' }
  }
  if (cust.status === 'paused') return { ok: false, skipped: 'paused', message: '일시정지 고객' }

  const amount = computeBillingAmountFromCustomer(cust)
  if (!amount || amount <= 0) return { ok: false, skipped: 'zero_amount', message: '청구 금액 0원 (서비스 제공)' }

  // 멱등: 이 시공 건으로 이미 만든 청구서가 있으면 끝
  const { data: linked } = await supabase
    .from('service_billings')
    .select('id, status')
    .eq('application_id', app.id)
    .maybeSingle()
  if (linked) return { ok: false, skipped: 'already_linked', message: '이미 청구서가 연결된 시공 건입니다' }

  const timing: BillingTiming = cust.billing_timing ?? 'postpaid'
  const today = todayKstIso()
  const constructionDate = app.construction_date ? String(app.construction_date).slice(0, 10) : today
  const period = constructionDate.slice(0, 7)
  const notifyStart = computeNotifyStartDate({
    trigger: 'per_visit', timing, dueDate: null,
    constructionDate, workCompletedDate: today,
  })
  const dueDate = timing === 'postpaid' ? today : constructionDate

  const samePeriod = await findBillingsForPeriod(supabase, cust.id, period)
  const paidUnlinked = samePeriod.find(b => b.status === 'paid' && !b.application_id)
  if (paidUnlinked) {
    // 이미 그 달 돈을 받았으면 이 시공 건을 그 청구서에 연결만 하고 끝
    await supabase.from('service_billings').update({ application_id: app.id }).eq('id', paidUnlinked.id)
    return { ok: false, skipped: 'already_paid', message: '해당 월 청구서가 이미 결제완료' }
  }

  let billingId: string
  let created = false
  const pendingUnlinked = samePeriod.find(b => b.status === 'pending' && !b.application_id)
  if (pendingUnlinked) {
    // application_id 가 아직 비어 있는 경우에만 연결 → 동시에 두 번 불려도 한쪽만 성공
    const { data: attached, error } = await supabase
      .from('service_billings')
      .update({ application_id: app.id, notify_start_date: notifyStart, due_date: dueDate, billing_timing: timing })
      .eq('id', pendingUnlinked.id)
      .is('application_id', null)
      .select('id')
    if (error) {
      if (error.code === '23505') return { ok: false, skipped: 'already_linked', message: '이미 청구서가 연결된 시공 건입니다' }
      return { ok: false, skipped: 'error', message: error.message }
    }
    if (!attached || attached.length === 0) return { ok: false, skipped: 'already_linked', message: '다른 요청이 먼저 연결했습니다' }
    billingId = pendingUnlinked.id
  } else {
    // 같은 달에 이미 다른 시공 건 청구서가 있으면 기간 키를 날짜로 (billing_period 는 고객별 유일해야 함)
    const periodKey = samePeriod.length === 0 ? period : constructionDate
    const { data: inserted, error } = await supabase
      .from('service_billings')
      .insert({
        customer_id: cust.id,
        billing_type: samePeriod.length === 0 ? 'monthly' : 'onetime',
        billing_period: periodKey,
        amount,
        due_date: dueDate,
        status: 'pending',
        service_type: cust.customer_type,
        billing_timing: timing,
        application_id: app.id,
        notify_start_date: notifyStart,
      })
      .select('id')
      .single()
    if (error?.code === '23505') return { ok: false, skipped: 'already_linked', message: '이미 청구서가 연결된 시공 건입니다 (unique)' }
    if (error || !inserted) return { ok: false, skipped: 'error', message: error?.message ?? 'insert 실패' }
    billingId = inserted.id as string
    created = true
  }

  let notified: 'sent' | 'auto_charged' | 'none' = 'none'
  const shouldSendNow = sendNow && !cust.auto_notification_paused && !!notifyStart && notifyStart <= today
  if (shouldSendNow) {
    const r = await sendRecurringBillingNotice(supabase, billingId, { method: 'auto', source })
    if (r.ok) notified = r.kind
  }
  return { ok: true, billingId, created, notified }
}

/**
 * 호출부용 안전 래퍼: 어떤 에러가 나도 본 요청을 깨뜨리지 않는다.
 * progress_status 가 '작업완료'로 바뀐 직후에만 부른다.
 */
export async function activatePerVisitBillingSafe(supabase: Supabase, applicationId: string, source: string): Promise<void> {
  try {
    const r = await activatePerVisitBilling(supabase, applicationId, { sendNow: true, source })
    if (!r.ok && r.skipped === 'error') {
      console.error('[per-visit-billing] 실패:', applicationId, r.message)
    }
  } catch (e) {
    console.error('[per-visit-billing] 예외:', applicationId, e instanceof Error ? e.message : e)
  }
}
