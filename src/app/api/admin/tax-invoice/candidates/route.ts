import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

// Phase 22 v12: 세금계산서 발행 대상 통합 조회 (신규 아키텍처)
// - source 'application': service_applications 중 결제완료+미발행 — **1회성케어만** (정기유형은 billings로 이관됨)
// - source 'billing'    : service_billings 중 due_date≤오늘 + 미발행 — 정기딥연간·정기딥월간·정기엔드 모두
//
// query params:
//   include_issued=true              → 이미 발행된 건도 포함 (이력 확인용)
//   source=application|billing       → 특정 소스만
//   service_type=A,B,...             → 다중 필터 (콤마 구분)
//   payment_method=A,B,...           → 다중 필터 (콤마 구분)
//   from=YYYY-MM-DD, to=YYYY-MM-DD   → 기준일자 필터

const APPLICATION_TARGET_STATUSES = ['결제완료', '결제완료(잔금)']
const APPLICATION_ISSUED_STATUS = '계산서발행완료'

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
  source_id: string
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
  billing_period: string | null       // billings 전용
  construction_date: string | null    // applications 전용
  created_at: string
  tax_invoice_issued: boolean
  tax_invoice_issued_at: string | null
  // 필수 정보 유효성 (사업자번호·상호·대표자 세 필드 기준)
  is_valid: boolean
  missing_fields: string[]
  // Phase 3: 발행 전 편집 draft
  has_draft: boolean
  draft_supplier_id: string | null
  draft_items: DraftItem[] | null
  // 홈택스 CSV 전용 draft 필드 (없어도 발행 가능, 있으면 CSV에 채워짐)
  draft_receiver_business_type: string | null   // P
  draft_receiver_business_item: string | null   // Q
  draft_receiver_email_2: string | null         // S
  draft_receipt_type: string | null             // BG — 기본 '01' 영수
  draft_invoice_kind: string | null             // A — 기본 '01' 일반
}

function checkValidity(row: Pick<Candidate, 'business_number' | 'business_name' | 'owner_name'>): {
  is_valid: boolean; missing_fields: string[]
} {
  const missing: string[] = []
  if (!row.business_number?.trim()) missing.push('사업자번호')
  if (!row.business_name?.trim()) missing.push('상호')
  if (!row.owner_name?.trim()) missing.push('대표자')
  return { is_valid: missing.length === 0, missing_fields: missing }
}

export async function GET(request: NextRequest) {
  const session = getServerSession()
  if (session?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const includeIssued = searchParams.get('include_issued') === 'true'
  const sourceFilter = searchParams.get('source') as Source | null
  const serviceTypeParam = searchParams.get('service_type')
  const serviceTypes = serviceTypeParam ? serviceTypeParam.split(',').map(s => s.trim()).filter(Boolean) : null
  const paymentMethodParam = searchParams.get('payment_method')
  const paymentMethods = paymentMethodParam ? paymentMethodParam.split(',').map(s => s.trim()).filter(Boolean) : null
  const fromDate = searchParams.get('from')
  const toDate = searchParams.get('to')

  const supabase = createServiceClient()
  const results: Candidate[] = []

  // ── drafts 한번에 로드 (source+source_id 매칭용 맵) ────
  const { data: draftRows } = await supabase
    .from('tax_invoice_drafts')
    .select(
      'source, source_id, supplier_id, ' +
      'receiver_business_number, receiver_business_name, receiver_owner_name, ' +
      'receiver_address, receiver_email, receiver_email_2, ' +
      'receiver_business_type, receiver_business_item, ' +
      'items, invoice_kind, bill_receipt_type'
    )
  const draftMap = new Map<string, {
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
  }>()
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

  // ── 소스 1: service_applications (1회성케어 전용) ─────────────────────
  // Phase 22 v12: 정기딥/정기엔드 발행 대상은 모두 billings에서 조회하므로 여기선 1회성만
  if (!sourceFilter || sourceFilter === 'application') {
    let appQ = supabase
      .from('service_applications')
      .select(`
        id,
        service_type,
        business_name,
        business_number,
        owner_name,
        address,
        email,
        phone,
        payment_method,
        supply_amount,
        vat,
        construction_date,
        status,
        tax_invoice_issued,
        tax_invoice_issued_at,
        created_at
      `)
      .is('deleted_at', null)
      .eq('service_type', '1회성케어')

    if (includeIssued) {
      appQ = appQ.in('status', [...APPLICATION_TARGET_STATUSES, APPLICATION_ISSUED_STATUS])
    } else {
      appQ = appQ.in('status', APPLICATION_TARGET_STATUSES).eq('tax_invoice_issued', false)
    }

    if (serviceTypes && serviceTypes.length > 0) appQ = appQ.in('service_type', serviceTypes)
    if (paymentMethods && paymentMethods.length > 0) appQ = appQ.in('payment_method', paymentMethods)
    if (fromDate) appQ = appQ.gte('construction_date', fromDate)
    if (toDate) appQ = appQ.lte('construction_date', toDate)

    const { data: apps, error: appErr } = await appQ.order('construction_date', { ascending: false })
    if (appErr) {
      return NextResponse.json({ error: `applications: ${appErr.message}` }, { status: 500 })
    }

    for (const a of apps ?? []) {
      const draft = draftMap.get(`application:${a.id}`)
      const business_number = draft?.receiver_business_number ?? a.business_number ?? null
      const business_name = draft?.receiver_business_name ?? a.business_name
      const owner_name = draft?.receiver_owner_name ?? a.owner_name
      const address = draft?.receiver_address ?? a.address ?? null
      const email = draft?.receiver_email ?? a.email ?? null

      // items 가 있으면 합계 재계산, 없으면 원본 사용
      let supply = Number(a.supply_amount ?? 0)
      let vat = Number(a.vat ?? 0)
      if (draft?.items && draft.items.length > 0) {
        supply = draft.items.reduce((s, i) => s + Number(i.supply_amount ?? (Number(i.qty ?? 1) * Number(i.unit_price ?? 0))), 0)
        vat = draft.items.reduce((s, i) => s + Number(i.vat ?? 0), 0)
        if (vat === 0) vat = Math.round(supply * 0.1)
      }

      const validity = checkValidity({ business_number, business_name, owner_name })
      results.push({
        source: 'application',
        source_id: a.id,
        service_type: a.service_type ?? null,
        business_name,
        business_number,
        owner_name,
        address,
        email,
        phone: a.phone ?? null,
        payment_method: a.payment_method ?? null,
        supply_amount: supply,
        vat,
        total_amount: supply + vat,
        billing_period: null,
        construction_date: a.construction_date ?? null,
        created_at: a.created_at,
        tax_invoice_issued: a.tax_invoice_issued === true || a.status === APPLICATION_ISSUED_STATUS,
        tax_invoice_issued_at: a.tax_invoice_issued_at ?? null,
        ...validity,
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

  // ── 소스 2: service_billings JOIN customers ─────────
  if (!sourceFilter || sourceFilter === 'billing') {
    // Phase 22 v11: billings 소스는 결제 완료 여부와 무관하게 due_date 도래한 것 모두 후보
    // (선청구/후결제 지원 — 계산서는 결제 전에도 발행 가능)
    const todayISO = new Date().toISOString().slice(0, 10)
    let billQ = supabase
      .from('service_billings')
      .select(`
        id,
        customer_id,
        billing_type,
        billing_period,
        amount,
        status,
        due_date,
        tax_invoice_issued,
        tax_invoice_issued_date,
        created_at,
        customers!inner (
          id,
          business_name,
          business_number,
          contact_name,
          address,
          email,
          contact_phone,
          customer_type,
          payment_method
        )
      `)
      .lte('due_date', todayISO)

    if (!includeIssued) billQ = billQ.eq('tax_invoice_issued', false)
    if (fromDate) billQ = billQ.gte('due_date', fromDate)
    if (toDate) billQ = billQ.lte('due_date', toDate)

    const { data: bills, error: billErr } = await billQ.order('created_at', { ascending: false })
    if (billErr) {
      return NextResponse.json({ error: `billings: ${billErr.message}` }, { status: 500 })
    }

    for (const b of bills ?? []) {
      // customers 는 !inner JOIN 이므로 배열이 아닌 객체로 오지만 supabase-js 타입은 array 로 잡음
      const c = Array.isArray(b.customers) ? b.customers[0] : b.customers
      if (!c) continue

      // customer_type 필터 (service_type 파라미터와 매칭)
      if (serviceTypes && serviceTypes.length > 0 && !serviceTypes.includes(c.customer_type ?? '')) continue
      // payment_method 필터
      if (paymentMethods && paymentMethods.length > 0 && !paymentMethods.includes(c.payment_method ?? '')) continue

      const draft = draftMap.get(`billing:${b.id}`)
      const business_number = draft?.receiver_business_number ?? c.business_number ?? null
      const business_name = draft?.receiver_business_name ?? c.business_name
      const owner_name = draft?.receiver_owner_name ?? c.contact_name ?? ''
      const address = draft?.receiver_address ?? c.address ?? null
      const email = draft?.receiver_email ?? c.email ?? null
      const phone = c.contact_phone ?? null

      const amount = Number(b.amount ?? 0)
      let supply = Math.round(amount / 1.1)
      let vat = amount - supply
      if (draft?.items && draft.items.length > 0) {
        supply = draft.items.reduce((s, i) => s + Number(i.supply_amount ?? (Number(i.qty ?? 1) * Number(i.unit_price ?? 0))), 0)
        vat = draft.items.reduce((s, i) => s + Number(i.vat ?? 0), 0)
        if (vat === 0) vat = Math.round(supply * 0.1)
      }

      const validity = checkValidity({ business_number, business_name, owner_name })

      results.push({
        source: 'billing',
        source_id: b.id,
        service_type: c.customer_type ?? null,
        business_name,
        business_number,
        owner_name,
        address,
        email,
        phone,
        payment_method: c.payment_method ?? null,
        supply_amount: supply,
        vat,
        total_amount: supply + vat,
        billing_period: b.billing_period ?? null,
        construction_date: null,
        created_at: b.created_at ?? new Date().toISOString(),
        tax_invoice_issued: !!b.tax_invoice_issued,
        tax_invoice_issued_at: b.tax_invoice_issued_date ?? null,
        ...validity,
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

  // ── 필터 옵션 (필터 무시한 전체 unique 값) ─────────
  const [appPmRes, custPmRes, appStRes, custStRes] = await Promise.all([
    supabase.from('service_applications').select('payment_method').is('deleted_at', null).not('payment_method', 'is', null),
    supabase.from('customers').select('payment_method').is('deleted_at', null).not('payment_method', 'is', null),
    supabase.from('service_applications').select('service_type').is('deleted_at', null).not('service_type', 'is', null),
    supabase.from('customers').select('customer_type').is('deleted_at', null).not('customer_type', 'is', null),
  ])

  const pmSet = new Set<string>()
  for (const r of appPmRes.data ?? []) if (r.payment_method) pmSet.add(r.payment_method)
  for (const r of custPmRes.data ?? []) if (r.payment_method) pmSet.add(r.payment_method)

  const stSet = new Set<string>()
  for (const r of appStRes.data ?? []) if (r.service_type) stSet.add(r.service_type)
  for (const r of custStRes.data ?? []) if (r.customer_type) stSet.add(r.customer_type)

  return NextResponse.json({
    candidates: results,
    count: results.length,
    available_payment_methods: [...pmSet].sort(),
    available_service_types: [...stSet].sort(),
  })
}
