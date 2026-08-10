import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { sendByTemplate } from '@/lib/template-sender'
import { sendSmsOrLms } from '@/lib/solapi'
import { saveNotificationHistory } from '@/lib/notification'
import { appendBothNotificationLogs } from '@/lib/notification-log'
import type { NotificationContext } from '@/lib/notification-variables'

export const dynamic = 'force-dynamic'

// 세금계산서 발행 완료 처리 (3개 소스 통합)
//
// POST body:
// {
//   items: [
//     { source: 'application', source_id: 'uuid' },
//     { source: 'customer',    source_id: 'customer_uuid', billing_ids: ['b1', 'b2'] },
//   ],
//   supplier_id?: string,
//   spreadsheet_id?: string,
//   file_url?: string,
// }

interface MarkItem {
  source: 'application' | 'customer'
  source_id: string
  billing_ids?: string[]   // customer 소스 전용 — 선택된 기간의 billing id 목록
}

export async function POST(request: NextRequest) {
  const session = getServerSession()
  if (session?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const rawItems = body.items

  const items: MarkItem[] = Array.isArray(rawItems)
    ? rawItems.filter((i): i is MarkItem =>
        i && typeof i === 'object'
        && (i.source === 'application' || i.source === 'customer')
        && typeof i.source_id === 'string' && i.source_id.length > 0)
    : []

  if (items.length === 0) {
    return NextResponse.json({ error: 'items 필수 (배열)' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const issuedAtIso = new Date().toISOString()
  const issuedAtDate = issuedAtIso.slice(0, 10)

  const appItems = items.filter(i => i.source === 'application')
  const customerItems = items.filter(i => i.source === 'customer')

  // billing_ids 수집 (customer 소스 전체)
  const allBillingIds = customerItems.flatMap(i => i.billing_ids ?? []).filter(Boolean)

  let updatedApps: string[] = []
  let updatedBills: string[] = []

  // ── 1회성케어: service_applications ──────────────────────────
  const customerIdsFromApps: string[] = []
  if (appItems.length > 0) {
    const appIds = appItems.map(i => i.source_id)
    const { data, error } = await supabase
      .from('service_applications')
      .update({
        tax_invoice_issued: true,
        tax_invoice_issued_at: issuedAtIso,
        status: '계산서발행완료',
        // 알림 발송 경로(api/admin/notify)와 dual-write 정합성 유지 —
        // 계산서발행완료알림 발송 시 payment_status_detail도 동일하게 세팅되므로
        // 수동 발행완료 버튼에서도 동일하게 세팅해야 세부화면 결제상태 필드가 동기화됨.
        payment_status_detail: '계산서발행완료',
      })
      .in('id', appIds)
      .select('id, customer_id')
    if (error) return NextResponse.json({ error: `applications: ${error.message}` }, { status: 500 })
    updatedApps = (data ?? []).map(r => r.id as string)
    for (const r of data ?? []) {
      if (r.customer_id) customerIdsFromApps.push(r.customer_id as string)
    }
  }

  // ── 정기케어: service_billings (선택된 기간 billing_ids만) ────
  if (allBillingIds.length > 0) {
    const { data, error } = await supabase
      .from('service_billings')
      .update({
        tax_invoice_issued: true,
        tax_invoice_issued_date: issuedAtDate,
      })
      .in('id', allBillingIds)
      .select('id')
    if (error) return NextResponse.json({ error: `billings: ${error.message}` }, { status: 500 })
    updatedBills = (data ?? []).map(r => r.id as string)
  }

  // ── customers.tax_invoice_issued 동기화 ────────────────────────
  // - appItems: customer_id는 위에서 수집
  // - customerItems: source_id 자체가 customer_id
  const customerIdsFromBillings = customerItems.map(i => i.source_id)
  const allCustomerIds = [...new Set([...customerIdsFromApps, ...customerIdsFromBillings])]
  if (allCustomerIds.length > 0) {
    await supabase
      .from('customers')
      .update({ tax_invoice_issued: true })
      .in('id', allCustomerIds)
  }

  // ── Phase 27-V: 반자동 알림 발송 ────────────────────────────
  // 유형별로 계산서발행완료알림 발송 + 이력 저장.
  // 실패해도 DB 세팅은 유지 (사용자 결정 B: 관리자가 재발송 가능).
  let sentNotifications = 0
  let failedNotifications = 0
  const nowIsoKst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('Z', '+09:00')

  // 1회성: application 소스 — sendByTemplate + appendBothNotificationLogs
  if (updatedApps.length > 0) {
    const { data: apps } = await supabase
      .from('service_applications')
      .select('id, customer_id, phone, business_name, owner_name, email, address, construction_date, payment_method, supply_amount, vat, notification_log')
      .in('id', updatedApps)

    for (const app of (apps ?? [])) {
      const phone = String(app.phone ?? '').replace(/-/g, '')
      if (!phone) { failedNotifications++; continue }

      const context: NotificationContext = {
        application: {
          business_name: (app.business_name as string | null) ?? null,
          owner_name: (app.owner_name as string | null) ?? null,
          phone: (app.phone as string | null) ?? null,
          email: (app.email as string | null) ?? null,
          address: (app.address as string | null) ?? null,
          construction_date: (app.construction_date as string | null) ?? null,
          payment_method: (app.payment_method as string | null) ?? null,
          supply_amount: (app.supply_amount as number | null) ?? null,
          vat: (app.vat as number | null) ?? null,
        },
      }

      try {
        const result = await sendByTemplate('계산서발행완료알림_1회성', phone, context)
        if (!result.ok) { failedNotifications++; continue }

        const existLog = Array.isArray(app.notification_log)
          ? (app.notification_log as object[])
          : []
        const entry = {
          type: '계산서발행완료알림',
          sent_at: nowIsoKst,
          phone,
          method: 'auto' as const,
          channel: result.type,
        }
        await appendBothNotificationLogs(supabase, {
          appId: app.id as string,
          customerId: app.customer_id as string | null,
          existingAppLog: existLog,
          entry,
        })
        await saveNotificationHistory({
          category: 'sms',
          type: '계산서발행완료알림',
          body: result.text,
          method: 'auto',
          recipientType: 'customer',
          recipientPhone: phone,
          metadata: {
            application_id: app.id as string,
            business_name: app.business_name as string,
            channel: result.type,
            source: 'admin/tax-invoice/mark-issued',
          },
          status: 'sent',
        })
        sentNotifications++
      } catch { failedNotifications++ }
    }
  }

  // 정기딥/정기엔드: billing 소스 — 청구별로 template body 로드 → 청구월 치환 → sendSmsOrLms
  if (updatedBills.length > 0) {
    const { data: bills } = await supabase
      .from('service_billings')
      .select(`
        id, billing_type, billing_period,
        customers!inner(id, business_name, contact_phone, customer_type, notification_log)
      `)
      .in('id', updatedBills)

    type BillRow = {
      id: string
      billing_type: string
      billing_period: string
      customers: {
        id: string
        business_name: string
        contact_phone: string | null
        customer_type: string | null
        notification_log: unknown
      }
    }

    // 템플릿 body 캐시 (정기딥/정기엔드용, 반복 조회 방지)
    const templateCache = new Map<string, { body: string; subject: string | null }>()
    async function getTemplate(code: string): Promise<{ body: string; subject: string | null } | null> {
      if (templateCache.has(code)) return templateCache.get(code)!
      const { data } = await supabase
        .from('notification_templates')
        .select('body, subject')
        .eq('code', code)
        .maybeSingle()
      if (!data) return null
      const entry = { body: data.body as string, subject: (data.subject as string | null) ?? null }
      templateCache.set(code, entry)
      return entry
    }

    for (const row of ((bills ?? []) as unknown as BillRow[])) {
      const cust = row.customers
      const phone = (cust.contact_phone ?? '').replace(/-/g, '')
      if (!phone) { failedNotifications++; continue }

      const suffix = cust.customer_type === '정기딥케어' ? '_정기딥' : '_정기엔드'
      const templateCode = `계산서발행완료알림${suffix}`
      const tpl = await getTemplate(templateCode)
      if (!tpl) { failedNotifications++; continue }

      // 청구월 라벨: monthly '2026년 8월분', annual '2026년 (연간)'
      const monthLabel = row.billing_type === 'annual'
        ? `${row.billing_period}년 (연간)`
        : `${row.billing_period.slice(0, 4)}년 ${parseInt(row.billing_period.slice(5, 7), 10)}월분`

      const body = tpl.body
        .replace(/\{\{업체명\}\}/g, cust.business_name)
        .replace(/\{\{청구월\}\}/g, monthLabel)

      try {
        await sendSmsOrLms(phone, body, { subject: tpl.subject ?? undefined })

        // customers.notification_log 에 append (세부화면 '고객 알림 발송 이력' 섹션 노출)
        const existLog = Array.isArray(cust.notification_log)
          ? (cust.notification_log as object[])
          : []
        const entry = {
          type: '계산서발행완료알림',
          sent_at: nowIsoKst,
          phone,
          method: 'auto' as const,
          channel: 'sms',
          billing_id: row.id,
          billing_period: row.billing_period,
        }
        await supabase
          .from('customers')
          .update({ notification_log: [entry, ...existLog] })
          .eq('id', cust.id)

        await saveNotificationHistory({
          category: 'sms',
          type: '계산서발행완료알림',
          body,
          method: 'auto',
          recipientType: 'customer',
          recipientPhone: phone,
          metadata: {
            billing_id: row.id,
            customer_id: cust.id,
            business_name: cust.business_name,
            billing_period: row.billing_period,
            billing_type: row.billing_type,
            source: 'admin/tax-invoice/mark-issued',
          },
          status: 'sent',
        })
        sentNotifications++
      } catch { failedNotifications++ }
    }
  }

  // ── 감사 로그 ─────────────────────────────────────────────────
  const spreadsheetId: string = body.spreadsheet_id ?? ''
  const totalCount = updatedApps.length + updatedBills.length
  let logId: string | null = null

  if (totalCount > 0) {
    const sourceLabel = appItems.length && customerItems.length
      ? 'mixed'
      : (appItems.length ? 'application' : 'customer')

    const { data, error } = await supabase
      .from('invoice_logs')
      .insert({
        issued_at: issuedAtIso,
        count: totalCount,
        spreadsheet_id: spreadsheetId,
        file_url: body.file_url ?? (spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` : ''),
        issued_by: session?.userId ?? 'admin-ui',
        application_ids: updatedApps,
        billing_ids: updatedBills,
        source: sourceLabel,
        supplier_id: body.supplier_id ?? null,
        is_active: true,
      })
      .select('id')
      .single()
    if (error) {
      console.error('[tax-invoice/mark-issued] log insert failed:', error)
    } else {
      logId = data?.id as string
    }
  }

  return NextResponse.json({
    ok: true,
    updated_applications: updatedApps.length,
    updated_billings: updatedBills.length,
    sent_notifications: sentNotifications,
    failed_notifications: failedNotifications,
    log_id: logId,
  })
}

// ── 발행 취소 (재발행 필요 시) ────────────────────────────────
// PATCH body: { items: [...], void_reason?: string }
export async function PATCH(request: NextRequest) {
  const session = getServerSession()
  if (session?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const rawItems = body.items

  const items: MarkItem[] = Array.isArray(rawItems)
    ? rawItems.filter((i): i is MarkItem =>
        i && typeof i === 'object'
        && (i.source === 'application' || i.source === 'customer')
        && typeof i.source_id === 'string' && i.source_id.length > 0)
    : []

  if (items.length === 0) {
    return NextResponse.json({ error: 'items 필수 (배열)' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const appIds = items.filter(i => i.source === 'application').map(i => i.source_id)
  const allBillingIds = items
    .filter(i => i.source === 'customer')
    .flatMap(i => i.billing_ids ?? [])
    .filter(Boolean)

  if (appIds.length > 0) {
    await supabase
      .from('service_applications')
      .update({
        tax_invoice_issued: false,
        tax_invoice_issued_at: null,
        status: '결제완료',
        // POST 발행완료에서 세팅한 payment_status_detail도 되돌림 (status와 동일하게).
        payment_status_detail: '결제완료',
      })
      .in('id', appIds)
  }

  if (allBillingIds.length > 0) {
    await supabase
      .from('service_billings')
      .update({
        tax_invoice_issued: false,
        tax_invoice_issued_date: null,
      })
      .in('id', allBillingIds)
  }

  // 관련 최근 로그 무효화
  const { data: recentLogs } = await supabase
    .from('invoice_logs')
    .select('id, application_ids, billing_ids')
    .eq('is_active', true)
    .order('issued_at', { ascending: false })
    .limit(20)

  const nowIso = new Date().toISOString()
  for (const log of recentLogs ?? []) {
    const logAppIds: string[] = Array.isArray(log.application_ids) ? log.application_ids : []
    const logBillIds: string[] = Array.isArray(log.billing_ids) ? log.billing_ids : []
    const hitApp = appIds.some(id => logAppIds.includes(id))
    const hitBill = allBillingIds.some(id => logBillIds.includes(id))
    if (hitApp || hitBill) {
      await supabase
        .from('invoice_logs')
        .update({
          is_active: false,
          voided_at: nowIso,
          void_reason: body.void_reason ?? '재발행',
        })
        .eq('id', log.id)
      break
    }
  }

  return NextResponse.json({
    ok: true,
    reverted_applications: appIds.length,
    reverted_billings: allBillingIds.length,
  })
}
