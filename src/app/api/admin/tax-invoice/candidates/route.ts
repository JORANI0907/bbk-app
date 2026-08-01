import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

// 세금계산서 발행 대상 조회 (v2 — billing 단위 행)
// - source 'application': 1회성케어 — service_applications 1건 = 1행
// - source 'billing'    : 정기딥/엔드케어 — service_billings 1건 = 1행
//
// query params:
//   include_issued=true       → 발행완료 건도 포함
//   service_type=A,B,...      → 유형 필터 (1회성케어, 정기딥케어, 정기엔드케어)

// 부가세 미적용 결제방법
const NO_VAT_METHODS = new Set(['현금(비과세)', '카드(온라인 간편결제)', '플랫폼'])

type Source = 'application' | 'billing'

interface DraftItem {
  name: string
  spec?: string
  qty?: number
  unit_price?: number
  supply_amount?: number
  vat?: number
  remark?: string
}

interface Candidate {
  source: Source
  source_id: string       // application.id 또는 billing.id
  customer_id: string | null
  service_type: string | null
  business_name: string
  business_number: string | null
  owner_name: string
  address: string | null
  email: string | null
  phone: string | null
  payment_method: string | null
  supply_amount: number
  vat: number
  total_amount: number
  billing_id: string | null
  billing_period: string | null   // '2026-07' or '2026'
  billing_type: 'monthly' | 'annual' | null
  display_period: string | null   // '2026년 7월' or '2026년 3월 (연간)'
  billing_status: 'pending' | 'paid' | 'overdue' | null
  application_id: string | null
  construction_date: string | null
  created_at: string
  tax_invoice_issued: boolean
  tax_invoice_issued_at: string | null
  is_valid: boolean
  missing_fields: string[]
  has_draft: boolean
  draft_supplier_id: string | null
  draft_items: DraftItem[] | null
  draft_receiver_business_type: string | null
  draft_receiver_business_item: string | null
  draft_receiver_email_2: string | null
  draft_receipt_type: string | null
  draft_invoice_kind: string | null
  application_status?: string | null
}

interface DraftData {
  supplier_id: string | null
  receiver_business_number: string | null
  receiver_business_name: string | null
  receiver_owner_name: string | null
  receiver_address: string | null
  receiver_email: string | null
  receiver_email_2: string | null
  receiver_business_type: string | null
  receiver_business_item: string | null
  items: DraftItem[] | null
  invoice_kind: string | null
  bill_receipt_type: string | null
}

interface DraftRow {
  source: string
  source_id: string
  supplier_id: string | null
  receiver_business_number: string | null
  receiver_business_name: string | null
  receiver_owner_name: string | null
  receiver_address: string | null
  receiver_email: string | null
  receiver_email_2: string | null
  receiver_business_type: string | null
  receiver_business_item: string | null
  items: unknown
  invoice_kind: string | null
  bill_receipt_type: string | null
}

function checkValidity(row: { business_number: string | null; business_name: string; owner_name: string }): {
  is_valid: boolean; missing_fields: string[]
} {
  const missing: string[] = []
  if (!row.business_number?.trim()) missing.push('사업자번호')
  if (!row.business_name?.trim()) missing.push('상호')
  if (!row.owner_name?.trim()) missing.push('대표자')
  return { is_valid: missing.length === 0, missing_fields: missing }
}

function calcAmounts(amount: number, payment_method: string | null): { supply: number; vat: number } {
  if (!payment_method || NO_VAT_METHODS.has(payment_method)) {
    return { supply: amount, vat: 0 }
  }
  const supply = Math.round(amount / 1.1)
  return { supply, vat: amount - supply }
}

// billing_period + billing_type + due_date → 표시용 기간 문자열
function calcDisplayPeriod(billing_period: string, billing_type: string, due_date: string | null): string {
  if (billing_type === 'annual') {
    if (due_date) {
      const mo = parseInt(due_date.split('-')[1] ?? '0', 10)
      return `${billing_period.slice(0, 4)}년 ${mo}월 (연간)`
    }
    return `${billing_period.slice(0, 4)}년 (연간)`
  }
  const parts = billing_period.split('-')
  const y = parseInt(parts[0] ?? '0', 10)
  const mo = parseInt(parts[1] ?? '0', 10)
  return `${y}년 ${mo}월`
}

export async function GET(request: NextRequest) {
  const session = getServerSession()
  if (session?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const includeIssued = searchParams.get('include_issued') === 'true'
  const serviceTypeParam = searchParams.get('service_type')
  const serviceTypes = serviceTypeParam
    ? serviceTypeParam.split(',').map(s => s.trim()).filter(Boolean)
    : null

  const skipOneTime = serviceTypes !== null && !serviceTypes.includes('1회성케어')
  const skipPeriodic = serviceTypes !== null &&
    !serviceTypes.some(t => ['정기딥케어', '정기엔드케어'].includes(t))

  const supabase = createServiceClient()
  const results: Candidate[] = []

  // ── drafts 한번에 로드 ──────────────────────────────────────────
  const { data: draftRows } = await supabase
    .from('tax_invoice_drafts')
    .select(
      'source, source_id, supplier_id, ' +
      'receiver_business_number, receiver_business_name, receiver_owner_name, ' +
      'receiver_address, receiver_email, receiver_email_2, ' +
      'receiver_business_type, receiver_business_item, ' +
      'items, invoice_kind, bill_receipt_type'
    )

  const draftMap = new Map<string, DraftData>()
  for (const d of ((draftRows ?? []) as unknown) as DraftRow[]) {
    draftMap.set(`${d.source}:${d.source_id}`, {
      supplier_id: d.supplier_id ?? null,
      receiver_business_number: d.receiver_business_number ?? null,
      receiver_business_name: d.receiver_business_name ?? null,
      receiver_owner_name: d.receiver_owner_name ?? null,
      receiver_address: d.receiver_address ?? null,
      receiver_email: d.receiver_email ?? null,
      receiver_email_2: d.receiver_email_2 ?? null,
      receiver_business_type: d.receiver_business_type ?? null,
      receiver_business_item: d.receiver_business_item ?? null,
      items: Array.isArray(d.items) ? d.items as DraftItem[] : null,
      invoice_kind: d.invoice_kind ?? null,
      bill_receipt_type: d.bill_receipt_type ?? null,
    })
  }

  // ── 소스 1: 1회성케어 — service_applications ─────────────────
  if (!skipOneTime) {
    interface SaRow {
      id: string
      construction_date: string | null
      status: string
      tax_invoice_issued: boolean
      tax_invoice_issued_at: string | null
      supply_amount: number | null
      vat: number | null
      payment_method: string | null
      created_at: string
      deleted_at: string | null
    }
    interface OneTimeCust {
      id: string
      business_name: string
      business_number: string | null
      contact_name: string | null
      address: string | null
      email: string | null
      contact_phone: string | null
      payment_method: string | null
      created_at: string
      service_applications: SaRow[]
    }

    const { data: oneTimeCusts, error: oneTimeErr } = await supabase
      .from('customers')
      .select(`
        id, business_name, business_number, contact_name, address, email, contact_phone,
        payment_method, created_at,
        service_applications (
          id, construction_date, status, tax_invoice_issued, tax_invoice_issued_at,
          supply_amount, vat, payment_method, created_at, deleted_at
        )
      `)
      .eq('customer_type', '1회성케어')
      .neq('pipeline_status', 'inquiry')
      .is('deleted_at', null)
      .is('archived_at', null)
      .order('created_at', { ascending: false })

    if (oneTimeErr) {
      return NextResponse.json({ error: `1회성케어: ${oneTimeErr.message}` }, { status: 500 })
    }

    for (const c of ((oneTimeCusts ?? []) as unknown) as OneTimeCust[]) {
      const apps = (Array.isArray(c.service_applications) ? c.service_applications : [])
        .filter((sa: SaRow) => !sa.deleted_at)

      for (const sa of apps) {
        const isIssued = sa.tax_invoice_issued === true || sa.status === '계산서발행완료'
        if (!includeIssued && isIssued) continue

        const draft = draftMap.get(`application:${sa.id}`)
        const business_number = draft?.receiver_business_number ?? c.business_number ?? null
        const business_name = draft?.receiver_business_name ?? c.business_name
        const owner_name = draft?.receiver_owner_name ?? c.contact_name ?? ''
        const address = draft?.receiver_address ?? c.address ?? null
        const email = draft?.receiver_email ?? c.email ?? null

        let supply: number
        let vat: number
        if (draft?.items && draft.items.length > 0) {
          supply = draft.items.reduce((s, i) => s + Number(i.supply_amount ?? (Number(i.qty ?? 1) * Number(i.unit_price ?? 0))), 0)
          vat = draft.items.reduce((s, i) => s + Number(i.vat ?? 0), 0)
          if (vat === 0) vat = Math.round(supply * 0.1)
        } else if (sa.supply_amount !== null) {
          supply = Number(sa.supply_amount)
          vat = Number(sa.vat ?? 0)
        } else {
          supply = 0; vat = 0
        }

        results.push({
          source: 'application',
          source_id: sa.id,
          customer_id: c.id,
          application_id: sa.id,
          service_type: '1회성케어',
          business_name,
          business_number,
          owner_name,
          address,
          email,
          phone: c.contact_phone ?? null,
          payment_method: sa.payment_method ?? c.payment_method ?? null,
          supply_amount: supply,
          vat,
          total_amount: supply + vat,
          billing_id: null,
          billing_period: null,
          billing_type: null,
          display_period: null,
          billing_status: null,
          construction_date: sa.construction_date ?? null,
          created_at: sa.created_at,
          tax_invoice_issued: isIssued,
          tax_invoice_issued_at: sa.tax_invoice_issued_at ?? null,
          ...checkValidity({ business_number, business_name, owner_name }),
          has_draft: !!draft,
          draft_supplier_id: draft?.supplier_id ?? null,
          draft_items: draft?.items ?? null,
          draft_receiver_business_type: draft?.receiver_business_type ?? null,
          draft_receiver_business_item: draft?.receiver_business_item ?? null,
          draft_receiver_email_2: draft?.receiver_email_2 ?? null,
          draft_receipt_type: draft?.bill_receipt_type ?? null,
          draft_invoice_kind: draft?.invoice_kind ?? null,
          application_status: sa.status ?? null,
        })
      }
    }
  }

  // ── 소스 2: 정기딥케어·정기엔드케어 — service_billings 단위 ──
  if (!skipPeriodic) {
    const periodicTypes = (serviceTypes?.filter(t => ['정기딥케어', '정기엔드케어'].includes(t)))
      ?? ['정기딥케어', '정기엔드케어']

    interface BillingRow {
      id: string
      billing_period: string
      billing_type: string
      amount: number | null
      status: string
      due_date: string | null
      tax_invoice_issued: boolean
      tax_invoice_issued_date: string | null
      created_at: string | null
    }
    interface PeriodicCust {
      id: string
      business_name: string
      business_number: string | null
      contact_name: string | null
      address: string | null
      email: string | null
      contact_phone: string | null
      customer_type: string | null
      payment_method: string | null
      created_at: string
      service_billings: BillingRow[]
    }

    const { data: customers, error: custErr } = await supabase
      .from('customers')
      .select(`
        id, business_name, business_number, contact_name, address, email, contact_phone,
        customer_type, payment_method, created_at,
        service_billings (
          id, billing_period, billing_type, amount, status, due_date,
          tax_invoice_issued, tax_invoice_issued_date, created_at
        )
      `)
      .in('customer_type', periodicTypes)
      .neq('pipeline_status', 'inquiry')
      .is('deleted_at', null)
      .is('archived_at', null)
      .order('created_at', { ascending: false })

    if (custErr) {
      return NextResponse.json({ error: `정기케어: ${custErr.message}` }, { status: 500 })
    }

    for (const c of ((customers ?? []) as unknown) as PeriodicCust[]) {
      const rawBillings = Array.isArray(c.service_billings) ? c.service_billings : []

      for (const b of rawBillings) {
        const isIssued = !!b.tax_invoice_issued
        if (!includeIssued && isIssued) continue

        const draft = draftMap.get(`billing:${b.id}`)
        const business_number = draft?.receiver_business_number ?? c.business_number ?? null
        const business_name = draft?.receiver_business_name ?? c.business_name
        const owner_name = draft?.receiver_owner_name ?? c.contact_name ?? ''
        const address = draft?.receiver_address ?? c.address ?? null
        const email = draft?.receiver_email ?? c.email ?? null
        const payment_method = c.payment_method ?? null

        let supply: number
        let vat: number
        if (draft?.items && draft.items.length > 0) {
          supply = draft.items.reduce((s, i) => s + Number(i.supply_amount ?? (Number(i.qty ?? 1) * Number(i.unit_price ?? 0))), 0)
          vat = draft.items.reduce((s, i) => s + Number(i.vat ?? 0), 0)
          if (vat === 0) vat = Math.round(supply * 0.1)
        } else {
          const amounts = calcAmounts(Number(b.amount ?? 0), payment_method)
          supply = amounts.supply
          vat = amounts.vat
        }

        const display_period = calcDisplayPeriod(b.billing_period, b.billing_type, b.due_date ?? null)

        results.push({
          source: 'billing',
          source_id: b.id,
          customer_id: c.id,
          application_id: null,
          service_type: c.customer_type ?? null,
          business_name,
          business_number,
          owner_name,
          address,
          email,
          phone: c.contact_phone ?? null,
          payment_method,
          supply_amount: supply,
          vat,
          total_amount: supply + vat,
          billing_id: b.id,
          billing_period: b.billing_period,
          billing_type: b.billing_type as 'monthly' | 'annual',
          display_period,
          billing_status: b.status as 'pending' | 'paid' | 'overdue',
          construction_date: null,
          created_at: b.created_at ?? new Date().toISOString(),
          tax_invoice_issued: isIssued,
          tax_invoice_issued_at: b.tax_invoice_issued_date ?? null,
          ...checkValidity({ business_number, business_name, owner_name }),
          has_draft: !!draft,
          draft_supplier_id: draft?.supplier_id ?? null,
          draft_items: draft?.items ?? null,
          draft_receiver_business_type: draft?.receiver_business_type ?? null,
          draft_receiver_business_item: draft?.receiver_business_item ?? null,
          draft_receiver_email_2: draft?.receiver_email_2 ?? null,
          draft_receipt_type: draft?.bill_receipt_type ?? null,
          draft_invoice_kind: draft?.invoice_kind ?? null,
        })
      }
    }
  }

  return NextResponse.json({ candidates: results, count: results.length })
}
