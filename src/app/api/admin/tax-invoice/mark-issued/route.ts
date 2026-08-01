import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

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
