import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

// Phase 4: 두 소스 모두 반영하는 통합 발행 완료 처리
// 요청 형식:
// {
//   items: [
//     { source: 'application', source_id: 'uuid' },
//     { source: 'billing',     source_id: 'uuid' },
//   ],
//   supplier_id?: string,
//   spreadsheet_id?: string,
//   file_url?: string,
// }
//
// 응답:
// { ok, updated_applications, updated_billings, log_id }

interface MarkItem {
  source: 'application' | 'billing'
  source_id: string
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
        && (i.source === 'application' || i.source === 'billing')
        && typeof i.source_id === 'string' && i.source_id.length > 0)
    : []

  if (items.length === 0) {
    return NextResponse.json({ error: 'items 필수 (배열)' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const issuedAtIso = new Date().toISOString()
  const issuedAtDate = issuedAtIso.slice(0, 10)

  const appIds = items.filter(i => i.source === 'application').map(i => i.source_id)
  const billIds = items.filter(i => i.source === 'billing').map(i => i.source_id)

  let updatedApps: string[] = []
  let updatedBills: string[] = []

  // ── applications ─────────────────────────────
  if (appIds.length > 0) {
    const { data, error } = await supabase
      .from('service_applications')
      .update({
        tax_invoice_issued: true,
        tax_invoice_issued_at: issuedAtIso,
        status: '계산서발행완료',   // 하위 호환 유지 (기존 필터가 이 값을 참조)
      })
      .in('id', appIds)
      .select('id')
    if (error) return NextResponse.json({ error: `applications: ${error.message}` }, { status: 500 })
    updatedApps = (data ?? []).map(r => r.id as string)
  }

  // ── billings ─────────────────────────────────
  if (billIds.length > 0) {
    const { data, error } = await supabase
      .from('service_billings')
      .update({
        tax_invoice_issued: true,
        tax_invoice_issued_date: issuedAtDate,
      })
      .in('id', billIds)
      .select('id')
    if (error) return NextResponse.json({ error: `billings: ${error.message}` }, { status: 500 })
    updatedBills = (data ?? []).map(r => r.id as string)
  }

  // ── invoice_logs 감사 로그 (한 개의 통합 레코드) ──
  const spreadsheetId: string = body.spreadsheet_id ?? ''
  const totalCount = updatedApps.length + updatedBills.length
  let logId: string | null = null
  if (totalCount > 0) {
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
        source: appIds.length && billIds.length ? 'mixed' : (appIds.length ? 'application' : 'billing'),
        supplier_id: body.supplier_id ?? null,
        is_active: true,
      })
      .select('id')
      .single()
    if (error) {
      // 로그 실패는 non-blocking
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

// ── 취소 (재발행 필요 시 원상복구) ──────────────────
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
        && (i.source === 'application' || i.source === 'billing')
        && typeof i.source_id === 'string' && i.source_id.length > 0)
    : []

  if (items.length === 0) {
    return NextResponse.json({ error: 'items 필수 (배열)' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const appIds = items.filter(i => i.source === 'application').map(i => i.source_id)
  const billIds = items.filter(i => i.source === 'billing').map(i => i.source_id)

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
  if (billIds.length > 0) {
    await supabase
      .from('service_billings')
      .update({
        tax_invoice_issued: false,
        tax_invoice_issued_date: null,
      })
      .in('id', billIds)
  }

  // 관련 최근 log 를 voided 처리 (마지막 활성 로그 하나만)
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
    const hitBill = billIds.some(id => logBillIds.includes(id))
    if (hitApp || hitBill) {
      await supabase
        .from('invoice_logs')
        .update({
          is_active: false,
          voided_at: nowIso,
          void_reason: body.void_reason ?? '재발행',
        })
        .eq('id', log.id)
      break   // 가장 최근 매칭 하나만 무효화
    }
  }

  return NextResponse.json({
    ok: true,
    reverted_applications: appIds.length,
    reverted_billings: billIds.length,
  })
}
