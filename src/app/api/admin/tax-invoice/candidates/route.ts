import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

// 세금계산서 발행 대상 통합 조회
// - source 'application': service_applications — 1회성케어 (결제완료 상태)
// - source 'customer'   : customers — 정기딥케어·정기엔드케어 마스터 1행
//                         내부적으로 service_billings paid 건을 집계해 invoice_status 산출
//
// query params:
//   include_issued=true              → 발행완료 건도 포함
//   source=application|customer      → 특정 소스만
//   service_type=A,B,...             → 다중 필터
//   payment_method=A,B,...           → 다중 필터
//   customer_status=active,paused,terminated → 정기케어 고객 상태 필터 (기본: 모두)
//   from=YYYY-MM-DD, to=YYYY-MM-DD   → 기준일자 필터 (application 전용)

const APPLICATION_ISSUED_STATUS = '계산서발행완료'

type Source = 'application' | 'customer'

interface DraftItem {
  name: string
  spec?: string
  qty?: number
  unit_price?: number
  supply_amount?: number
  vat?: number
  remark?: string
}

export interface BillingPeriodItem {
  billing_id: string
  billing_period: string
  billing_type: 'monthly' | 'annual'
  amount: number
  supply_amount: number
  vat: number
  billing_status: 'pending' | 'paid' | 'overdue'
  tax_invoice_issued: boolean
  tax_invoice_issued_date: string | null
  due_date: string | null
}

export type InvoiceStatus = 'no_paid' | 'unissued' | 'partial' | 'all_issued'

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
  billing_period: string | null
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
  // application 소스 전용
  application_status?: string | null
  // customer 소스 전용
  customer_status?: 'active' | 'paused' | 'terminated'
  invoice_status?: InvoiceStatus
  billing_periods?: BillingPeriodItem[]
  paid_count?: number
  unissued_count?: number
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

function calcInvoiceStatus(paidCount: number, issuedCount: number): InvoiceStatus {
  if (paidCount === 0) return 'no_paid'
  if (issuedCount === 0) return 'unissued'
  if (issuedCount < paidCount) return 'partial'
  return 'all_issued'
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
  const allServiceTypes = serviceTypeParam ? serviceTypeParam.split(',').map(s => s.trim()).filter(Boolean) : null
  // '미배정'은 pipeline_status = 'inquiry' 를 의미하는 가상 유형 — 나머지 필터와 분리 처리
  const includeUnassigned = allServiceTypes?.includes('미배정') ?? false
  const serviceTypes = allServiceTypes
    ? allServiceTypes.filter(t => t !== '미배정').filter(Boolean)
    : null
  const normalServiceTypes = (serviceTypes && serviceTypes.length > 0) ? serviceTypes : null
  // 미배정만 선택된 경우 → Source 1·2 완전 스킵
  const onlyUnassigned = includeUnassigned && (!allServiceTypes || allServiceTypes.filter(t => t !== '미배정').length === 0)
  const paymentMethodParam = searchParams.get('payment_method')
  const paymentMethods = paymentMethodParam ? paymentMethodParam.split(',').map(s => s.trim()).filter(Boolean) : null
  const fromDate = searchParams.get('from')
  const toDate = searchParams.get('to')
  const customerStatusParam = searchParams.get('customer_status')
  const customerStatuses = customerStatusParam
    ? customerStatusParam.split(',').map(s => s.trim()).filter(Boolean)
    : ['active', 'paused', 'terminated']

  const supabase = createServiceClient()
  const results: Candidate[] = []

  // ── drafts 한번에 로드 ─────────────────────────────────────────
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

  // ── 소스 1: customers (1회성케어) + service_applications ───────
  // pipeline_status = 'inquiry' (미배정) 는 제외 — 별도 소스 3에서 처리
  if (!onlyUnassigned && (!sourceFilter || sourceFilter === 'application')) {
    const skipOneTime = normalServiceTypes && !normalServiceTypes.includes('1회성케어')

    if (!skipOneTime) {
      let custQ = supabase
        .from('customers')
        .select(`
          id, business_name, business_number, contact_name, address, email, contact_phone,
          payment_method, status, created_at,
          service_applications (
            id, construction_date, status, tax_invoice_issued, tax_invoice_issued_at,
            supply_amount, vat, payment_method, created_at, deleted_at
          )
        `)
        .eq('customer_type', '1회성케어')
        .neq('pipeline_status', 'inquiry')
        .is('deleted_at', null)
        .is('archived_at', null)

      if (paymentMethods && paymentMethods.length > 0) {
        custQ = custQ.in('payment_method', paymentMethods)
      }

      const { data: oneTimeCusts, error: oneTimeErr } = await custQ.order('created_at', { ascending: false })
      if (oneTimeErr) {
        return NextResponse.json({ error: `1회성케어: ${oneTimeErr.message}` }, { status: 500 })
      }

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
        status: string | null
        created_at: string
        service_applications: SaRow[]
      }

      for (const c of ((oneTimeCusts ?? []) as unknown) as OneTimeCust[]) {
        const apps: SaRow[] = (Array.isArray(c.service_applications) ? c.service_applications : [])
          .filter((sa: SaRow) => !sa.deleted_at)

        // 시공일자 내림차순 정렬 (null은 아래로)
        const sortedApps = [...apps].sort((a, b) => {
          if (!a.construction_date && !b.construction_date) return 0
          if (!a.construction_date) return 1
          if (!b.construction_date) return -1
          return b.construction_date.localeCompare(a.construction_date)
        })

        for (const sa of sortedApps) {
          // 월별 날짜 필터
          if (fromDate && sa.construction_date && sa.construction_date < fromDate) continue
          if (toDate && sa.construction_date && sa.construction_date > toDate) continue

          const isIssued = sa.tax_invoice_issued === true || sa.status === APPLICATION_ISSUED_STATUS
          if (!includeIssued && isIssued) continue

          const draft = draftMap.get(`application:${sa.id}`)
          const business_number = draft?.receiver_business_number ?? c.business_number ?? null
          const business_name = draft?.receiver_business_name ?? c.business_name
          const owner_name = draft?.receiver_owner_name ?? c.contact_name ?? ''
          const address = draft?.receiver_address ?? c.address ?? null
          const email = draft?.receiver_email ?? c.email ?? null

          let supply = Number(sa.supply_amount ?? 0)
          let vat = Number(sa.vat ?? 0)
          if (draft?.items && draft.items.length > 0) {
            supply = draft.items.reduce((s, i) => s + Number(i.supply_amount ?? (Number(i.qty ?? 1) * Number(i.unit_price ?? 0))), 0)
            vat = draft.items.reduce((s, i) => s + Number(i.vat ?? 0), 0)
            if (vat === 0) vat = Math.round(supply * 0.1)
          }

          const validity = checkValidity({ business_number, business_name, owner_name })
          results.push({
            source: 'application',
            source_id: sa.id,
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
            billing_period: null,
            construction_date: sa.construction_date ?? null,
            created_at: sa.created_at,
            tax_invoice_issued: isIssued,
            tax_invoice_issued_at: sa.tax_invoice_issued_at ?? null,
            ...validity,
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
  }

  // ── 소스 2: customers (정기딥케어·정기엔드케어 마스터 단위) ────
  // pipeline_status = 'inquiry' 제외 + onlyUnassigned이면 통째로 스킵
  if (!onlyUnassigned && (!sourceFilter || sourceFilter === 'customer')) {
    // normalServiceTypes에 정기 유형이 없으면 이 소스 스킵 (early return → 플래그로 전환)
    const periodicFilterTypes = normalServiceTypes
      ? normalServiceTypes.filter(t => ['정기딥케어', '정기엔드케어'].includes(t))
      : null
    const skipPeriodic = normalServiceTypes !== null && (periodicFilterTypes?.length ?? 0) === 0

    if (!skipPeriodic) {
      let custQ = supabase
        .from('customers')
        .select(`
          id,
          business_name,
          business_number,
          contact_name,
          address,
          email,
          contact_phone,
          customer_type,
          payment_method,
          billing_cycle,
          billing_amount,
          status,
          created_at,
          service_billings (
            id,
            billing_period,
            billing_type,
            amount,
            status,
            due_date,
            tax_invoice_issued,
            tax_invoice_issued_date
          )
        `)
        .in('customer_type', ['정기딥케어', '정기엔드케어'])
        .neq('pipeline_status', 'inquiry')
        .is('deleted_at', null)
        .is('archived_at', null)
        .in('status', customerStatuses)

      if (paymentMethods && paymentMethods.length > 0) custQ = custQ.in('payment_method', paymentMethods)
      if (periodicFilterTypes && periodicFilterTypes.length > 0) {
        custQ = custQ.in('customer_type', periodicFilterTypes)
      }

      const { data: customers, error: custErr } = await custQ.order('created_at', { ascending: false })
    if (custErr) {
      return NextResponse.json({ error: `customers: ${custErr.message}` }, { status: 500 })
    }

    for (const c of customers ?? []) {
      const rawBillings = Array.isArray(c.service_billings) ? c.service_billings : []

      // paid 건 목록 집계
      const paidBillings = rawBillings.filter((b: { status: string }) => b.status === 'paid')
      const paidCount = paidBillings.length
      const issuedCount = paidBillings.filter((b: { tax_invoice_issued: boolean }) => b.tax_invoice_issued).length
      const unissuedCount = paidCount - issuedCount
      const invoiceStatus = calcInvoiceStatus(paidCount, issuedCount)

      // 전체 발행완료이고 includeIssued=false면 제외 (신규고객/결제이력 없는 고객은 포함)
      if (!includeIssued && invoiceStatus === 'all_issued') continue

      // billing_periods: 모든 기간 포함 (모달에서 전체 이력 확인 가능하도록)
      const billingPeriods: BillingPeriodItem[] = rawBillings
        .sort((a: { billing_period: string }, b: { billing_period: string }) =>
          b.billing_period.localeCompare(a.billing_period)
        )
        .map((b: {
          id: string
          billing_period: string
          billing_type: string
          amount: number
          status: string
          tax_invoice_issued: boolean
          tax_invoice_issued_date: string | null
          due_date: string | null
        }): BillingPeriodItem => {
          const amount = Number(b.amount ?? 0)
          const supply = Math.round(amount / 1.1)
          const vat = amount - supply
          return {
            billing_id: b.id,
            billing_period: b.billing_period,
            billing_type: b.billing_type as 'monthly' | 'annual',
            amount,
            supply_amount: supply,
            vat,
            billing_status: b.status as 'pending' | 'paid' | 'overdue',
            tax_invoice_issued: !!b.tax_invoice_issued,
            tax_invoice_issued_date: b.tax_invoice_issued_date ?? null,
            due_date: b.due_date ?? null,
          }
        })

      // 미발행 paid 건 금액 합계 (대표 금액으로 표시)
      const unissuedAmount = paidBillings
        .filter((b: { tax_invoice_issued: boolean }) => !b.tax_invoice_issued)
        .reduce((sum: number, b: { amount: number }) => sum + Number(b.amount ?? 0), 0)
      const unissuedSupply = Math.round(unissuedAmount / 1.1)
      const unissuedVat = unissuedAmount - unissuedSupply

      const draft = draftMap.get(`customer:${c.id}`)
      const business_number = draft?.receiver_business_number ?? c.business_number ?? null
      const business_name = draft?.receiver_business_name ?? c.business_name
      const owner_name = draft?.receiver_owner_name ?? c.contact_name ?? ''
      const address = draft?.receiver_address ?? c.address ?? null
      const email = draft?.receiver_email ?? c.email ?? null

      let supply = unissuedSupply
      let vat = unissuedVat
      if (draft?.items && draft.items.length > 0) {
        supply = draft.items.reduce((s, i) => s + Number(i.supply_amount ?? (Number(i.qty ?? 1) * Number(i.unit_price ?? 0))), 0)
        vat = draft.items.reduce((s, i) => s + Number(i.vat ?? 0), 0)
        if (vat === 0) vat = Math.round(supply * 0.1)
      }

      const validity = checkValidity({ business_number, business_name, owner_name })

      results.push({
        source: 'customer',
        source_id: c.id,
        application_id: null,
        service_type: c.customer_type ?? null,
        business_name,
        business_number,
        owner_name,
        address,
        email,
        phone: c.contact_phone ?? null,
        payment_method: c.payment_method ?? null,
        supply_amount: supply,
        vat,
        total_amount: supply + vat,
        billing_period: null,
        construction_date: null,
        created_at: c.created_at ?? new Date().toISOString(),
        tax_invoice_issued: invoiceStatus === 'all_issued',
        tax_invoice_issued_at: null,
        ...validity,
        has_draft: !!draft,
        draft_supplier_id: draft?.supplier_id ?? null,
        draft_items: draft?.items ?? null,
        draft_receiver_business_type: draft?.receiver_business_type ?? null,
        draft_receiver_business_item: draft?.receiver_business_item ?? null,
        draft_receiver_email_2: draft?.receiver_email_2 ?? null,
        draft_receipt_type: draft?.bill_receipt_type ?? null,
        draft_invoice_kind: draft?.invoice_kind ?? null,
        // customer 소스 전용
        customer_status: (c.status as 'active' | 'paused' | 'terminated') ?? 'active',
        invoice_status: invoiceStatus,
        billing_periods: billingPeriods,
        paid_count: paidCount,
        unissued_count: unissuedCount,
      })
    }
    } // end if (!skipPeriodic)
  } // end if (!onlyUnassigned && customer source)

  // ── 소스 3: 미배정 (pipeline_status = 'inquiry') ──────────────
  if (includeUnassigned) {
    let unassignedQ = supabase
      .from('customers')
      .select(`
        id, business_name, business_number, contact_name, address, email, contact_phone,
        payment_method, customer_type, status, created_at
      `)
      .eq('pipeline_status', 'inquiry')
      .is('deleted_at', null)
      .is('archived_at', null)

    // 다른 유형도 함께 선택된 경우 해당 유형만 필터
    if (normalServiceTypes && normalServiceTypes.length > 0) {
      unassignedQ = unassignedQ.in('customer_type', normalServiceTypes)
    }
    if (paymentMethods && paymentMethods.length > 0) {
      unassignedQ = unassignedQ.in('payment_method', paymentMethods)
    }

    const { data: unassignedCusts, error: unassignedErr } = await unassignedQ.order('created_at', { ascending: false })
    if (unassignedErr) {
      return NextResponse.json({ error: `미배정: ${unassignedErr.message}` }, { status: 500 })
    }

    for (const c of (unassignedCusts ?? [])) {
      const draft = draftMap.get(`customer:${c.id}`)
      const business_number = draft?.receiver_business_number ?? (c as { business_number?: string | null }).business_number ?? null
      const business_name = draft?.receiver_business_name ?? (c as { business_name: string }).business_name
      const owner_name = draft?.receiver_owner_name ?? (c as { contact_name?: string | null }).contact_name ?? ''
      const address = draft?.receiver_address ?? (c as { address?: string | null }).address ?? null
      const email = draft?.receiver_email ?? (c as { email?: string | null }).email ?? null

      let supply = 0
      let vat = 0
      if (draft?.items && draft.items.length > 0) {
        supply = draft.items.reduce((s, i) => s + Number(i.supply_amount ?? (Number(i.qty ?? 1) * Number(i.unit_price ?? 0))), 0)
        vat = draft.items.reduce((s, i) => s + Number(i.vat ?? 0), 0)
        if (vat === 0) vat = Math.round(supply * 0.1)
      }

      const validity = checkValidity({ business_number, business_name, owner_name })

      results.push({
        source: 'customer',
        source_id: (c as { id: string }).id,
        application_id: null,
        service_type: '미배정',
        business_name,
        business_number,
        owner_name,
        address,
        email,
        phone: (c as { contact_phone?: string | null }).contact_phone ?? null,
        payment_method: (c as { payment_method?: string | null }).payment_method ?? null,
        supply_amount: supply,
        vat,
        total_amount: supply + vat,
        billing_period: null,
        construction_date: null,
        created_at: (c as { created_at?: string }).created_at ?? new Date().toISOString(),
        tax_invoice_issued: false,
        tax_invoice_issued_at: null,
        ...validity,
        has_draft: !!draft,
        draft_supplier_id: draft?.supplier_id ?? null,
        draft_items: draft?.items ?? null,
        draft_receiver_business_type: draft?.receiver_business_type ?? null,
        draft_receiver_business_item: draft?.receiver_business_item ?? null,
        draft_receiver_email_2: draft?.receiver_email_2 ?? null,
        draft_receipt_type: draft?.bill_receipt_type ?? null,
        draft_invoice_kind: draft?.invoice_kind ?? null,
        customer_status: ((c as { status?: string }).status as 'active' | 'paused' | 'terminated') ?? 'active',
        invoice_status: 'no_paid' as InvoiceStatus,
        billing_periods: [],
        paid_count: 0,
        unissued_count: 0,
      })
    }
  }

  // ── 필터 옵션 ──────────────────────────────────────────────────
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
