import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { isBoltaConfigured, boltaKeyMode } from '@/lib/bolta/client'
import { issueTaxInvoices, recheckRequested, type IssueItemInput } from '@/lib/tax-invoice-issue'
import type { HometaxRow } from '@/lib/hometax-csv'

export const dynamic = 'force-dynamic'
// 건당 볼타 호출 최대 15초 × 순차 처리 → 함수 제한 시간 확보
export const maxDuration = 60

// 볼타 세금계산서 발행 요청 (관리자 "볼타로 발행" 버튼)
//
// POST body:
// {
//   supplier_id: string | null,
//   items: [{ source: 'application'|'billing', source_id, customer_id, row: HometaxRow }]
// }
// 응답: { ok, mode: 'test'|'live', requested, failed, skipped, uncertain, results[] }
//
// PATCH body: { items?: [{ source, source_id }] }  — 'requested' 로 멈춘 건 상태 재확인
// 응답: { ok, results: [{ source, source_id, outcome, message }] }

const MAX_ITEMS_PER_REQUEST = 20

function isRow(v: unknown): v is HometaxRow {
  if (!v || typeof v !== 'object') return false
  const r = v as Partial<HometaxRow>
  return typeof r.written_date === 'string'
    && !!r.supplier && typeof r.supplier === 'object'
    && !!r.receiver && typeof r.receiver === 'object'
    && Array.isArray(r.items)
}

function parseItems(raw: unknown): IssueItemInput[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((i): i is IssueItemInput =>
    i && typeof i === 'object'
    && (i.source === 'application' || i.source === 'billing')
    && typeof i.source_id === 'string' && i.source_id.length > 0
    && (i.customer_id === null || typeof i.customer_id === 'string')
    && isRow(i.row))
}

// GET: 볼타 설정 상태 (모달 배지용) → { configured, mode }
export async function GET() {
  const session = getServerSession()
  if (session?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ configured: isBoltaConfigured(), mode: boltaKeyMode() })
}

export async function POST(request: NextRequest) {
  const session = getServerSession()
  if (session?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isBoltaConfigured()) {
    return NextResponse.json({ error: 'BOLTA_API_KEY 가 설정되지 않았습니다' }, { status: 503 })
  }

  const body = await request.json().catch(() => ({}))
  const items = parseItems(body.items)
  if (items.length === 0) {
    return NextResponse.json({ error: 'items 필수 (배열, row 포함)' }, { status: 400 })
  }
  if (items.length > MAX_ITEMS_PER_REQUEST) {
    return NextResponse.json({ error: `한 번에 최대 ${MAX_ITEMS_PER_REQUEST}건까지 발행할 수 있습니다` }, { status: 400 })
  }
  const supplierId = typeof body.supplier_id === 'string' && body.supplier_id ? body.supplier_id : null

  try {
    const result = await issueTaxInvoices(createServiceClient(), items, supplierId)
    return NextResponse.json({ ok: true, mode: boltaKeyMode(), ...result })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '발행 요청 실패' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const session = getServerSession()
  if (session?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isBoltaConfigured()) {
    return NextResponse.json({ error: 'BOLTA_API_KEY 가 설정되지 않았습니다' }, { status: 503 })
  }
  const body = await request.json().catch(() => ({}))
  const filter = Array.isArray(body.items)
    ? (body.items as unknown[]).filter((i): i is { source: string; source_id: string } =>
        !!i && typeof i === 'object'
        && typeof (i as { source?: unknown }).source === 'string'
        && typeof (i as { source_id?: unknown }).source_id === 'string')
    : null
  try {
    const results = await recheckRequested(createServiceClient(), filter)
    return NextResponse.json({ ok: true, results })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '상태 확인 실패' }, { status: 500 })
  }
}
