/**
 * 예약금 이체 완료 처리 (1회성케어 전용)
 *
 * POST body:
 *   { items: [{ source: 'application', source_id: 'uuid' }, ...] }
 *   → 각 회차에 deposit_transferred_at 세팅 + payment_status_detail='예약금환급완료' +
 *     예약금환급완료알림_1회성 SMS 자동 발송 + notification_log/history 저장.
 *
 * PATCH body:
 *   { items: [{ source: 'application', source_id: 'uuid' }, ...] }
 *   → 취소: deposit_transferred_at=null + payment_status_detail 원복 (결제/예약금 입금).
 *     이미 발송된 SMS 는 되돌릴 수 없음.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { sendByTemplate } from '@/lib/template-sender'
import { saveNotificationHistory } from '@/lib/notification'
import { appendBothNotificationLogs } from '@/lib/notification-log'
import type { NotificationContext } from '@/lib/notification-variables'

export const dynamic = 'force-dynamic'

interface MarkItem {
  source: 'application'
  source_id: string
}

function parseItems(body: unknown): MarkItem[] {
  const raw = (body as { items?: unknown } | null)?.items
  return Array.isArray(raw)
    ? raw.filter((i): i is MarkItem =>
        !!i && typeof i === 'object'
        && (i as MarkItem).source === 'application'
        && typeof (i as MarkItem).source_id === 'string'
        && (i as MarkItem).source_id.length > 0,
      )
    : []
}

export async function POST(request: NextRequest) {
  const session = getServerSession()
  if (session?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const items = parseItems(body)
  if (items.length === 0) {
    return NextResponse.json({ error: 'items 필수 (application 소스만)' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const nowIso = new Date().toISOString()
  const nowIsoKst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('Z', '+09:00')

  const appIds = items.map(i => i.source_id)

  // 이체 완료 세팅. deposit_transferred_at 은 신규 컬럼 — DB 마이그레이션 안 됐어도
  // update 는 실패 없이 그 필드만 무시됨(Postgres 42703 에러 발생). optional-safe 하게
  // payment_status_detail 만이라도 먼저 세팅하고 deposit_transferred_at 은 try 로 분리.
  const { data: updated, error: updErr } = await supabase
    .from('service_applications')
    .update({
      deposit_transferred_at: nowIso,
      payment_status_detail: '예약금환급완료',
    })
    .in('id', appIds)
    .select('id, customer_id, phone, business_name, owner_name, email, address, construction_date, payment_method, supply_amount, vat, deposit, balance, notification_log')

  if (updErr) {
    // 신규 컬럼 미배포 대응: payment_status_detail 만 세팅 재시도
    const isMissingCol = /deposit_transferred_at/i.test(updErr.message)
    if (!isMissingCol) {
      return NextResponse.json({ error: `이체완료 처리 실패: ${updErr.message}` }, { status: 500 })
    }
    const fb = await supabase
      .from('service_applications')
      .update({ payment_status_detail: '예약금환급완료' })
      .in('id', appIds)
      .select('id, customer_id, phone, business_name, owner_name, email, address, construction_date, payment_method, supply_amount, vat, deposit, balance, notification_log')
    if (fb.error) {
      return NextResponse.json({ error: `이체완료 처리 실패(fb): ${fb.error.message}` }, { status: 500 })
    }
    return await sendNotifications(supabase, fb.data ?? [], appIds.length, nowIsoKst, {
      migrationPending: true,
    })
  }

  return await sendNotifications(supabase, updated ?? [], appIds.length, nowIsoKst, {})
}

interface SentResult {
  updated: number
  sent: number
  failed: number
  migrationPending?: boolean
}

async function sendNotifications(
  supabase: ReturnType<typeof createServiceClient>,
  apps: Array<{
    id: string
    customer_id: string | null
    phone: string | null
    business_name: string | null
    owner_name: string | null
    email: string | null
    address: string | null
    construction_date: string | null
    payment_method: string | null
    supply_amount: number | null
    vat: number | null
    deposit: number | null
    balance: number | null
    notification_log: unknown
  }>,
  totalRequested: number,
  nowIsoKst: string,
  opts: { migrationPending?: boolean },
): Promise<NextResponse> {
  let sent = 0, failed = 0

  for (const app of apps) {
    const phone = String(app.phone ?? '').replace(/-/g, '')
    if (!phone) { failed++; continue }

    const context: NotificationContext = {
      application: {
        business_name: app.business_name,
        owner_name: app.owner_name,
        phone: app.phone,
        email: app.email,
        address: app.address,
        construction_date: app.construction_date,
        payment_method: app.payment_method,
        supply_amount: app.supply_amount,
        vat: app.vat,
        deposit: app.deposit,
        balance: app.balance,
      },
    }

    try {
      const result = await sendByTemplate('예약금환급완료알림_1회성', phone, context)
      if (!result.ok) { failed++; continue }

      const existLog = Array.isArray(app.notification_log)
        ? (app.notification_log as object[])
        : []
      const entry = {
        type: '예약금환급완료알림',
        sent_at: nowIsoKst,
        phone,
        method: 'auto' as const,
        channel: result.type,
      }
      await appendBothNotificationLogs(supabase, {
        appId: app.id,
        customerId: app.customer_id,
        existingAppLog: existLog,
        entry,
      })
      await saveNotificationHistory({
        category: 'sms',
        type: '예약금환급완료알림',
        body: result.text,
        method: 'auto',
        recipientType: 'customer',
        recipientPhone: phone,
        metadata: {
          application_id: app.id,
          business_name: app.business_name ?? '',
          channel: result.type,
          source: 'admin/tax-invoice/mark-transferred',
        },
        status: 'sent',
      })
      sent++
    } catch { failed++ }
  }

  const body: SentResult = { updated: apps.length, sent, failed }
  if (opts.migrationPending) body.migrationPending = true
  void totalRequested
  return NextResponse.json(body)
}

export async function PATCH(request: NextRequest) {
  const session = getServerSession()
  if (session?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const items = parseItems(body)
  if (items.length === 0) {
    return NextResponse.json({ error: 'items 필수' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const appIds = items.map(i => i.source_id)

  // 취소: deposit_transferred_at = null, payment_status_detail 원복.
  // payment_status_detail 을 '결제' 로 되돌림 (예약금 입금 완료 후 다시 이체 대기 상태).
  const { error } = await supabase
    .from('service_applications')
    .update({
      deposit_transferred_at: null,
      payment_status_detail: '결제',
    })
    .in('id', appIds)

  if (error) {
    const isMissingCol = /deposit_transferred_at/i.test(error.message)
    if (!isMissingCol) {
      return NextResponse.json({ error: `이체완료 취소 실패: ${error.message}` }, { status: 500 })
    }
    const fb = await supabase
      .from('service_applications')
      .update({ payment_status_detail: '결제' })
      .in('id', appIds)
    if (fb.error) {
      return NextResponse.json({ error: `이체완료 취소 실패(fb): ${fb.error.message}` }, { status: 500 })
    }
    return NextResponse.json({ reverted: appIds.length, migrationPending: true })
  }

  return NextResponse.json({ reverted: appIds.length })
}
