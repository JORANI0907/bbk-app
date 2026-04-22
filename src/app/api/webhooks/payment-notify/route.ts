// P2-26: 결제 알림 자동 발송 웹훅
// Make.com에서 매일 오전 6시에 호출 (KST)
// Case 1: 1회성케어 + 정기딥케어(월간) — 작업완료 후 결제완료 전 매일
// Case 2: 정기엔드케어 — service_billings 기반, due_date 3일 전부터 paid 처리될 때까지
// Case 3: 정기딥케어(연간) — contract_end_date 30일 전부터 계약갱신 안내

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSMS, sendAlimtalk } from '@/lib/solapi'
import { notifySlack } from '@/lib/slack'

const ALIMTALK_BILLING = 'KA01TP260324125257636A2QdT1YNpL5' // 정기결제알림

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

interface BillingWithCustomer {
  id: string
  amount: number
  due_date: string
  last_notified_at: string | null
  customers: {
    contact_name: string
    contact_phone: string
    business_name: string
    customer_type: string | null
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

async function appendLog(
  supabase: ReturnType<typeof createServiceClient>,
  appId: string,
  existing: NotificationLogEntry[],
  entry: NotificationLogEntry,
): Promise<void> {
  await supabase
    .from('service_applications')
    .update({ notification_log: [entry, ...existing] })
    .eq('id', appId)
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-webhook-secret')
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const todayKST = toKSTDateString(new Date())
  const nowIso = new Date().toISOString()
  const results = { case1: 0, case2: 0, case3: 0, errors: 0 }

  // ── Case 1: 1회성케어 + 정기딥케어(월간) 결제 미완료 건 ─────────
  const UNPAID_STATUSES = ['작업완료', '결제']
  const { data: unpaidApps } = await supabase
    .from('service_applications')
    .select('id, owner_name, business_name, phone, balance, account_number, construction_date, status, service_type, notification_log')
    .in('status', UNPAID_STATUSES)
    .in('service_type', ['1회성케어', '정기딥케어'])
    .is('deleted_at', null)

  for (const raw of (unpaidApps ?? [])) {
    const app = raw as AppRow
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
      const msg = `[BBK 공간케어] ${app.owner_name}님, 잔금 ${balance.toLocaleString()}원 결제를 요청드립니다.\n계좌: ${account} 문의: 031-759-4877`
      await sendSMS(phone, msg)

      const entry: NotificationLogEntry = { type: '결제알림', sent_at: nowIso, phone, method: 'auto' }
      await appendLog(supabase, app.id, existingLog, entry)
      await notifySlack({ notifyType: '결제알림', customerName: app.owner_name ?? '', phone, businessName: app.business_name ?? '', constructionDate: app.construction_date, method: 'auto' }).catch(() => { /* 무시 */ })
      results.case1++
    } catch {
      results.errors++
    }
  }

  // ── Case 2: 정기엔드케어 — service_billings 기반 결제 알림 ────────
  // due_date 3일 전부터 status='paid'가 될 때까지 매일 발송
  const threeDaysLaterKST = toKSTDateString(
    new Date(Date.now() + 9 * 60 * 60 * 1000 + 3 * 24 * 60 * 60 * 1000),
  )

  const { data: pendingBillings } = await supabase
    .from('service_billings')
    .select('id, amount, due_date, last_notified_at, customers(contact_name, contact_phone, business_name, customer_type, deleted_at)')
    .eq('billing_type', 'monthly')
    .neq('status', 'paid')
    .lte('due_date', threeDaysLaterKST)

  for (const raw of (pendingBillings ?? [])) {
    const billing = raw as unknown as BillingWithCustomer
    const customer = billing.customers
    if (!customer || customer.deleted_at) continue
    if (customer.customer_type !== '정기엔드케어') continue

    const phone = (customer.contact_phone ?? '').replace(/-/g, '')
    if (!phone) continue

    // 오늘 이미 발송한 건 스킵
    if (billing.last_notified_at && isSameKSTDay(billing.last_notified_at, todayKST)) continue

    try {
      const amount = billing.amount ?? 0
      const dueDate = billing.due_date
      const contactName = customer.contact_name ?? ''
      const variables = {
        '#{고객명}': contactName,
        '#{청소비용}': amount.toLocaleString('ko-KR'),
      }
      const fallback = `[BBK 공간케어] ${contactName}님, ${dueDate} 정기 결제일입니다.\n금액: ${amount.toLocaleString()}원\n문의: 031-759-4877`

      try {
        await sendAlimtalk(phone, ALIMTALK_BILLING, variables, fallback)
      } catch {
        await sendSMS(phone, fallback)
      }

      await supabase
        .from('service_billings')
        .update({ last_notified_at: nowIso })
        .eq('id', billing.id)

      await notifySlack({
        notifyType: '정기결제알림(엔드케어)',
        customerName: contactName,
        phone,
        businessName: customer.business_name ?? '',
        constructionDate: dueDate,
        method: 'auto',
      }).catch(() => { /* 무시 */ })

      results.case2++
    } catch {
      results.errors++
    }
  }

  // ── Case 3: 정기딥케어(연간) — 계약 만료 30일 전부터 안내 ─────────
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
      const msg = `[BBK 공간케어] ${customer.contact_name}님, 연간 계약 만료가 ${daysUntilExpiry}일 후(${customer.contract_end_date})입니다.\n연장 관련 문의: 031-759-4877`
      await sendSMS(phone, msg)

      await notifySlack({ notifyType: '연간계약만료알림', customerName: customer.contact_name ?? '', phone, businessName: customer.business_name ?? '', constructionDate: customer.contract_end_date, method: 'auto' }).catch(() => { /* 무시 */ })
      results.case3++
    } catch {
      results.errors++
    }
  }

  return NextResponse.json({
    success: true,
    date: todayKST,
    sent_case1: results.case1,
    sent_case2: results.case2,
    sent_case3: results.case3,
    errors: results.errors,
  })
}
