// P2-26 / Phase 27-AP: 결제 알림 자동 발송 웹훅
// Make.com에서 type 파라미터로 시간대별 분기 호출
// - type: "morning" (기본값) → 06:00 KST
//   Case 1: 1회성케어 + 정기딥케어(월간) — 작업완료 후 결제완료 전 매일 SMS
// - type: "afternoon" → 14:00 KST
//   Case 3: 정기딥케어(연간) — contract_end_date 30일 전부터 계약갱신 안내 SMS
//   Case 4: 정기엔드케어 — payment_date 도래 후 이번 달 미결제 시 SMS (결제완료까지)
//   Case 5: 정기딥케어(연간) — annual due_date 도래 후 미결제 시 SMS (결제완료까지)
//
// Phase 27-AP: 하드코딩된 SMS fallback → notification_templates 참조.
// 관리자가 알림 관리에서 auto_used 를 끄면 그 case 자체를 skip.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSmsOrLms } from '@/lib/solapi'
import { notifySlack } from '@/lib/slack'
import { renderTemplate } from '@/lib/notification-renderer'
import type { NotificationContext } from '@/lib/notification-variables'
import { appendBothNotificationLogs } from '@/lib/notification-log'

// Phase 27-AP: 각 case 가 참조할 template code
const TEMPLATE_CODES = ['결제알림', '계약갱신알림', '정기결제알림'] as const
type TemplateGate = { body: string; is_active: boolean; auto_used: boolean }

interface NotificationLogEntry {
  type: string
  sent_at: string
  phone: string
  method: 'auto' | 'manual'
  template_id?: string
}

interface AppRow {
  id: string
  owner_name: string
  business_name: string
  phone: string
  balance: number | null
  account_number: string | null
  construction_date: string | null
  status: string
  service_type: string | null
  notification_log: NotificationLogEntry[] | null
  customer_id: string | null
}

interface CustomerRow {
  id: string
  business_name: string
  contact_name: string
  contact_phone: string
  billing_cycle: string | null
  contract_end_date: string | null
  billing_amount: number | null
  customer_type: string | null
}

interface EndcareCustomerRow {
  id: string
  business_name: string | null
  contact_name: string | null
  contact_phone: string | null
  payment_date: number | null
}

interface SimpleBillingRow {
  id: string
  amount: number
  due_date: string
  last_notified_at: string | null
}

interface AnnualBillingRow {
  id: string
  amount: number
  due_date: string
  last_notified_at: string | null
  customers: {
    contact_name: string | null
    contact_phone: string | null
    business_name: string | null
    customer_type: string | null
    billing_cycle: string | null
    deleted_at: string | null
  } | null
}

function toKSTDateString(date: Date): string {
  return date.toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).replace(/\. /g, '-').replace('.', '')
}

function daysDiff(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`)
  const b = new Date(`${to}T00:00:00Z`)
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

function isSameKSTDay(isoString: string, todayKST: string): boolean {
  const d = new Date(isoString)
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10) === todayKST
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-webhook-secret')
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const callType: string = (body as { type?: string }).type ?? 'morning'

  const supabase = createServiceClient()
  const todayKST = toKSTDateString(new Date())
  const nowIso = new Date().toISOString()
  const results = { case1: 0, case3: 0, case4: 0, case5: 0, skipped_switch_off: 0, errors: 0 }

  // Phase 27-AP: template 게이트 조회. 각 case 시작에서 auto_used·is_active 확인.
  // Phase 27-AQ: linked_progress_status / linked_payment_status 함께 조회 → 발송 성공 시 application 자동 갱신 (Case 1 만 적용).
  const { data: tplRows } = await supabase
    .from('notification_templates')
    .select('code, body, is_active, auto_used, linked_progress_status, linked_payment_status')
    .in('code', TEMPLATE_CODES as unknown as string[])
  const gate: Record<string, TemplateGate | undefined> = {}
  const linkedProgress: Record<string, string | null> = {}
  const linkedPayment: Record<string, string | null> = {}
  for (const t of (tplRows ?? []) as Array<TemplateGate & { code: string; linked_progress_status: string | null; linked_payment_status: string | null }>) {
    gate[t.code] = { body: t.body, is_active: t.is_active, auto_used: t.auto_used }
    linkedProgress[t.code] = t.linked_progress_status
    linkedPayment[t.code] = t.linked_payment_status
  }
  const canSend = (code: string) => Boolean(gate[code]?.is_active && gate[code]?.auto_used)
  const renderFallback = (code: string, ctx: NotificationContext, fallback: string): string => {
    const body = gate[code]?.body
    if (!body) return fallback
    const rendered = renderTemplate(body, ctx)
    return rendered || fallback
  }

  // ── MORNING (06:00 KST) ───────────────────────────────────────────────
  if (callType === 'morning') {

    // Case 1: 1회성케어 + 정기딥케어(월간) 결제 미완료 건
    // Phase 27-AP: 관리자가 알림 관리에서 '결제알림' 스위치 off 하면 전체 case skip
    if (!canSend('결제알림')) {
      results.skipped_switch_off++
    } else {
      const UNPAID_STATUSES = ['작업완료', '결제']
      // 결제완료로 간주하는 customers.payment_status_detail 값
      const PAID_STATUS_DETAILS = ['결제완료', '결제완료(잔금)', '카드결제 완료', '비과세', '계산서발행완료']

      const { data: unpaidApps } = await supabase
        .from('service_applications')
        .select('id, owner_name, business_name, phone, balance, account_number, construction_date, status, service_type, notification_log, customer_id, customers(payment_status_detail)')
        .in('status', UNPAID_STATUSES)
        .in('service_type', ['1회성케어', '정기딥케어'])
        .is('deleted_at', null)

      for (const raw of (unpaidApps ?? [])) {
        const app = raw as unknown as AppRow & { customers: { payment_status_detail: string | null } | null }

        // 고객 단위 결제완료 상태면 알림 발송 건너뜀
        const customerPayStatus = app.customers?.payment_status_detail ?? null
        if (customerPayStatus && PAID_STATUS_DETAILS.includes(customerPayStatus)) continue
        const phone = (app.phone ?? '').replace(/-/g, '')
        if (!phone) continue

        if (!app.construction_date || daysDiff(app.construction_date, todayKST) < 1) continue

        const existingLog: NotificationLogEntry[] = Array.isArray(app.notification_log)
          ? (app.notification_log as NotificationLogEntry[])
          : []

        const alreadySent = existingLog.some(
          (l) => l.type === '결제알림' && l.sent_at.startsWith(todayKST),
        )
        if (alreadySent) continue

        try {
          const balance = app.balance ?? 0
          const account = app.account_number ?? ''
          const hardFallback = `[BBK 공간케어] ${app.owner_name}님, 잔금 ${balance.toLocaleString()}원 결제를 요청드립니다.\n계좌: ${account} 문의: 031-759-4877`
          // Phase 27-AP: template body 로 SMS fallback 대체. 알림톡 실패 시 관리자가 편집한 문구가 나감.
          const context: NotificationContext = {
            application: {
              business_name: app.business_name,
              owner_name: app.owner_name,
              phone: app.phone,
              balance: app.balance,
              account_number: app.account_number,
              construction_date: app.construction_date,
            },
          }
          const fallback = renderFallback('결제알림', context, hardFallback)
          await sendSmsOrLms(phone, fallback)

          const entry: NotificationLogEntry = { type: '결제알림', sent_at: nowIso, phone, method: 'auto' }
          // Phase 27-AQ: notification_log + linked_* + customers 동기화
          const extraAppFields: Record<string, unknown> = {}
          if (linkedProgress['결제알림']) extraAppFields.progress_status = linkedProgress['결제알림']
          if (linkedPayment['결제알림'])  extraAppFields.payment_status_detail = linkedPayment['결제알림']
          await appendBothNotificationLogs(supabase, {
            appId: app.id,
            customerId: app.customer_id,
            existingAppLog: existingLog,
            entry,
            extraAppFields,
          })
          await notifySlack({ notifyType: '결제알림', customerName: app.owner_name ?? '', phone, businessName: app.business_name ?? '', constructionDate: app.construction_date, method: 'auto' }).catch(() => { /* 무시 */ })
          results.case1++
        } catch {
          results.errors++
        }
      }
    }
  }

  // ── AFTERNOON (14:00 KST) ─────────────────────────────────────────────
  if (callType === 'afternoon') {

    // Case 3: 정기딥케어(연간) — contract_end_date 30일 전부터 계약갱신 안내
    // Phase 27-AP: 스위치 게이트
    if (!canSend('계약갱신알림')) {
      results.skipped_switch_off++
    } else {
      const { data: yearlyCustomers } = await supabase
        .from('customers')
        .select('id, business_name, contact_name, contact_phone, billing_cycle, contract_end_date, billing_amount, customer_type')
        .eq('customer_type', '정기딥케어')
        .eq('billing_cycle', '연간')
        .not('contract_end_date', 'is', null)
        .is('deleted_at', null)

      for (const raw of (yearlyCustomers ?? [])) {
        const customer = raw as CustomerRow
        if (!customer.contract_end_date) continue

        const daysUntilExpiry = daysDiff(todayKST, customer.contract_end_date)
        if (daysUntilExpiry < 0 || daysUntilExpiry > 30) continue

        const phone = (customer.contact_phone ?? '').replace(/-/g, '')
        if (!phone) continue

        try {
          const hardFallback = `[BBK 공간케어] ${customer.contact_name}님, 연간 계약 만료가 ${daysUntilExpiry}일 후(${customer.contract_end_date})입니다.\n연장 관련 문의: 031-759-4877`
          // Phase 27-AP: template body 렌더링
          const context: NotificationContext = {
            customer: {
              business_name: customer.business_name,
              contact_name: customer.contact_name,
              contact_phone: customer.contact_phone,
              billing_cycle: customer.billing_cycle,
              contract_end_date: customer.contract_end_date,
              billing_amount: customer.billing_amount,
            },
          }
          const fallback = renderFallback('계약갱신알림', context, hardFallback)
          await sendSmsOrLms(phone, fallback)

          await notifySlack({ notifyType: '연간계약만료알림', customerName: customer.contact_name ?? '', phone, businessName: customer.business_name ?? '', constructionDate: customer.contract_end_date, method: 'auto' }).catch(() => { /* 무시 */ })
          results.case3++
        } catch {
          results.errors++
        }
      }
    }

    // Case 4 & Case 5: 정기결제알림 (엔드/딥연간) — 두 case 가 같은 template code 사용
    // Phase 27-AP: 한 스위치로 두 case 동시 통제. off 면 둘 다 skip.
    if (!canSend('정기결제알림')) {
      results.skipped_switch_off++
    } else {
      // Case 4: 정기엔드케어 — payment_date 도래 후 이번 달 미결제 시 알림톡
      const todayDayKST = parseInt(todayKST.split('-')[2], 10)
      const currentPeriod = todayKST.slice(0, 7) // 'YYYY-MM'

      const { data: endcareCustomers } = await supabase
        .from('customers')
        .select('id, business_name, contact_name, contact_phone, payment_date')
        .eq('customer_type', '정기엔드케어')
        .eq('status', 'active')
        .lte('payment_date', todayDayKST)
        .is('deleted_at', null)

      for (const raw of (endcareCustomers ?? [])) {
        const customer = raw as EndcareCustomerRow
        const phone = (customer.contact_phone ?? '').replace(/-/g, '')
        if (!phone) continue

        const { data: billing } = await supabase
          .from('service_billings')
          .select('id, amount, due_date, last_notified_at')
          .eq('customer_id', customer.id)
          .eq('billing_period', currentPeriod)
          .neq('status', 'paid')
          .maybeSingle()

        const b = billing as SimpleBillingRow | null
        if (!b) continue

        if (b.last_notified_at && isSameKSTDay(b.last_notified_at, todayKST)) continue

        try {
          const amount = b.amount ?? 0
          const contactName = customer.contact_name ?? ''
          const hardFallback = `[BBK 공간케어] ${contactName}님, ${b.due_date} 정기 결제일입니다.\n금액: ${amount.toLocaleString()}원\n문의: 031-759-4877`
          // Phase 27-AP: template body 렌더링
          const context: NotificationContext = {
            customer: {
              business_name: customer.business_name,
              contact_name: customer.contact_name,
              contact_phone: customer.contact_phone,
              billing_amount: amount,
              billing_next_date: b.due_date,
            },
          }
          const fallback = renderFallback('정기결제알림', context, hardFallback)

          await sendSmsOrLms(phone, fallback)

          await supabase
            .from('service_billings')
            .update({ last_notified_at: nowIso })
            .eq('id', b.id)

          await notifySlack({
            notifyType: '정기결제알림(엔드케어)',
            customerName: contactName,
            phone,
            businessName: customer.business_name ?? '',
            constructionDate: b.due_date,
            method: 'auto',
          }).catch(() => { /* 무시 */ })

          results.case4++
        } catch {
          results.errors++
        }
      }

      // Case 5: 정기딥케어(연간) — annual due_date 도래 후 미결제 시 알림톡
      const { data: annualBillings } = await supabase
        .from('service_billings')
        .select('id, amount, due_date, last_notified_at, customers(contact_name, contact_phone, business_name, customer_type, billing_cycle, deleted_at)')
        .eq('billing_type', 'annual')
        .neq('status', 'paid')
        .lte('due_date', todayKST)

      for (const raw of (annualBillings ?? [])) {
        const billing = raw as unknown as AnnualBillingRow
        const customer = billing.customers
        if (!customer || customer.deleted_at) continue
        if (customer.customer_type !== '정기딥케어') continue
        if (customer.billing_cycle !== '연간') continue

        const phone = (customer.contact_phone ?? '').replace(/-/g, '')
        if (!phone) continue

        if (billing.last_notified_at && isSameKSTDay(billing.last_notified_at, todayKST)) continue

        try {
          const amount = billing.amount ?? 0
          const contactName = customer.contact_name ?? ''
          const hardFallback = `[BBK 공간케어] ${contactName}님, ${billing.due_date} 연간 결제일입니다.\n금액: ${amount.toLocaleString()}원\n문의: 031-759-4877`
          // Phase 27-AP: template body 렌더링
          const context: NotificationContext = {
            customer: {
              business_name: customer.business_name,
              contact_name: customer.contact_name,
              contact_phone: customer.contact_phone,
              billing_cycle: customer.billing_cycle,
              billing_amount: amount,
              billing_next_date: billing.due_date,
            },
          }
          const fallback = renderFallback('정기결제알림', context, hardFallback)

          await sendSmsOrLms(phone, fallback)

          await supabase
            .from('service_billings')
            .update({ last_notified_at: nowIso })
            .eq('id', billing.id)

          await notifySlack({
            notifyType: '정기결제알림(딥케어연간)',
            customerName: contactName,
            phone,
            businessName: customer.business_name ?? '',
            constructionDate: billing.due_date,
            method: 'auto',
          }).catch(() => { /* 무시 */ })

          results.case5++
        } catch {
          results.errors++
        }
      }
    }
  }

  return NextResponse.json({
    success: true,
    date: todayKST,
    call_type: callType,
    sent_case1: results.case1,
    sent_case3: results.case3,
    sent_case4: results.case4,
    sent_case5: results.case5,
    errors: results.errors,
  })
}
