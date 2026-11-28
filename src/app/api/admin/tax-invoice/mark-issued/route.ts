import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { markInvoicesIssued, parseMarkItems, type MarkItem } from '@/lib/tax-invoice-mark-issued'

export const dynamic = 'force-dynamic'

// 세금계산서 발행 완료 처리 (3개 소스 통합)
// 실제 처리 로직은 src/lib/tax-invoice-mark-issued.ts (볼타 웹훅과 공용, 2026-11-28)
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

export async function POST(request: NextRequest) {
  const session = getServerSession()
  if (session?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const items = parseMarkItems(body.items)
  if (items.length === 0) {
    return NextResponse.json({ error: 'items 필수 (배열)' }, { status: 400 })
  }

  try {
    const result = await markInvoicesIssued(createServiceClient(), items, {
      issuedBy: session?.userId ?? 'admin-ui',
      supplierId: body.supplier_id ?? null,
      spreadsheetId: typeof body.spreadsheet_id === 'string' ? body.spreadsheet_id : undefined,
      fileUrl: typeof body.file_url === 'string' ? body.file_url : undefined,
    })
    return NextResponse.json({
      ok: true,
      updated_applications: result.updatedApps.length,
      updated_billings: result.updatedBills.length,
      sent_notifications: result.sentNotifications,
      failed_notifications: result.failedNotifications,
      log_id: result.logId,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '처리 실패' }, { status: 500 })
  }
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

  const revertedCustomerIds: string[] = []
  if (appIds.length > 0) {
    const { data } = await supabase
      .from('service_applications')
      .update({
        tax_invoice_issued: false,
        tax_invoice_issued_at: null,
        status: '결제완료',
        // POST 발행완료에서 세팅한 payment_status_detail도 되돌림 (status와 동일하게).
        payment_status_detail: '결제완료',
      })
      .in('id', appIds)
      .select('customer_id')
    for (const r of data ?? []) {
      if (r.customer_id) revertedCustomerIds.push(r.customer_id as string)
    }
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

  // customers.progress_status·tax_invoice_issued 되돌림
  // - appItems 의 customer_id 는 위에서 수집, customerItems 의 source_id 는 곧 customer_id
  const customerIdsFromBillingRevert = items
    .filter(i => i.source === 'customer')
    .map(i => i.source_id)
  const allRevertCustomerIds = [...new Set([...revertedCustomerIds, ...customerIdsFromBillingRevert])]
  if (allRevertCustomerIds.length > 0) {
    await supabase
      .from('customers')
      .update({
        tax_invoice_issued: false,
        progress_status: '결제완료',
      })
      .in('id', allRevertCustomerIds)
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
