// P2-26: 결제 알림 자동 발송 웹훅
// Make.com에서 매일 호출
// Case 1: 1회성케어 + 정기딥케어(월간) — 작업완료 후 결제완료 전 매일
// Case 2: 정기엔드케어 — customers.payment_date가 오늘이고 이번달 미결제
// Case 3: 정기딥케어(연간) — contract_end_date 30일 전부터

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSMS } from '@/lib/solapi'
import { notifySlack } from '@/lib/slack'

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
  payment_date: number | null
  payment_months: string[] | null
  contract_end_date: string | null
  billing_amount: number | null
  account_number: string | null
  customer_type: string | null
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
  const UNPAID_STATUSES = ['작업완료', '결제요청', '결제대기']
  const { data: unpaidApps } = await supabase
    .from('service_applications')
    .select('id, owner_name, business_name, phone, balance, account_number, construction_date, status, service_type, notification_log')
    .in('status', UNPAID_STATUSES)
    .in('service_type', ['1회성케어', '정기딥케어'])

  for (const raw of (unpaidApps ?? [])) {
    const app = raw as AppRow
    const phone = (app.phone ?? '').replace(/-/g, '')
    if (!phone) continue

    // 시공일 다음날부터 발송
    if (!app.construction_date || daysDiff(app.construction_date, todayKST) < 1) continue

    const existingLog: NotificationLogEntry[] = Array.isArray(app.notification_log)
      ? (app.notification_log as NotificationLogEntry[])
      : []

    // 오늘 이미 발송했으면 스킵
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

  // ── Case 2: 정기엔드케어 — 오늘이 결제일자인 고객 ────────────────
  const todayDay = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', day: 'numeric' })
  const todayDayNum = parseInt(todayDay, 10)
  const todayYearMonth = todayKST.slice(0, 7) // e.g. "2026-04"

  const { data: endCareCustomers } = await supabase
    .from('customers')
    .select('id, business_name, contact_name, contact_phone, billing_cycle, payment_date, payment_months, contract_end_date, billing_amount, account_number, customer_type')
    .eq('customer_type', '정기엔드케어')
    .eq('payment_date', todayDayNum)

  for (const raw of (endCareCustomers ?? [])) {
    const customer = raw as CustomerRow
    const phone = (customer.contact_phone ?? '').replace(/-/g, '')
    if (!phone) continue

    // 이번달 결제 완료 여부 확인
    const paymentMonths: string[] = Array.isArray(customer.payment_months)
      ? (customer.payment_months as string[])
      : []
    if (paymentMonths.includes(todayYearMonth)) continue

    try {
      const amount = customer.billing_amount ?? 0
      const account = customer.account_number ?? ''
      const msg = `[BBK 공간케어] ${customer.contact_name}님, ${todayYearMonth} 정기 결제일입니다.\n금액: ${amount.toLocaleString()}원\n계좌: ${account}\n문의: 031-759-4877`
      await sendSMS(phone, msg)

      await notifySlack({ notifyType: '정기결제알림(엔드케어)', customerName: customer.contact_name ?? '', phone, businessName: customer.business_name ?? '', constructionDate: todayKST, method: 'auto' }).catch(() => { /* 무시 */ })
      results.case2++
    } catch {
      results.errors++
    }
  }

  // ── Case 3: 정기딥케어(연간) — 만료 30일 전부터 ─────────────────
  const { data: yearlyCustomers } = await supabase
    .from('customers')
    .select('id, business_name, contact_name, contact_phone, billing_cycle, payment_date, payment_months, contract_end_date, billing_amount, account_number, customer_type')
    .eq('customer_type', '정기딥케어')
    .eq('billing_cycle', '연간')
    .not('contract_end_date', 'is', null)

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
    sent_case1: results.case1,
    sent_case2: results.case2,
    sent_case3: results.case3,
    errors: results.errors,
  })
}
