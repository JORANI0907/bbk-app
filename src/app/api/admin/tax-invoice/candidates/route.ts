import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

// 세금계산서 발행 대상 통합 조회
// - source 'application': service_applications 중 결제완료 + 현금(계산서) + 미발행 (1회성/정기딥케어 대상)
// - source 'billing'    : service_billings 중 status='paid' + tax_invoice_issued=false (정기엔드케어 등)
//
// query params:
//   include_issued=true  → 이미 발행된 건도 포함 (이력 확인용)
//   source=application|billing → 특정 소스만
//   service_type=정기엔드케어,1회성케어,... → 필터
//   from=YYYY-MM-DD, to=YYYY-MM-DD → 기준일자 필터 (applications는 construction_date, billings는 created_at 기준)

const APPLICATION_TARGET_STATUSES = ['결제완료', '결제완료(잔금)']
const APPLICATION_TARGET_PAYMENT_METHODS = ['현금(계산서 희망)', '현금(계산서)']
const APPLICATION_ISSUED_STATUS = '계산서발행완료'

type Source = 'application' | 'billing'

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
  const fromDate = searchParams.get('from')
  const toDate = searchParams.get('to')

  const supabase = createServiceClient()
  const results: Candidate[] = []

  // ── 소스 1: service_applications ─────────────────────
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
        created_at
      `)
      .is('deleted_at', null)
      .in('payment_method', APPLICATION_TARGET_PAYMENT_METHODS)

    if (includeIssued) {
      appQ = appQ.in('status', [...APPLICATION_TARGET_STATUSES, APPLICATION_ISSUED_STATUS])
    } else {
      appQ = appQ.in('status', APPLICATION_TARGET_STATUSES)
    }

    if (serviceTypes && serviceTypes.length > 0) appQ = appQ.in('service_type', serviceTypes)
    if (fromDate) appQ = appQ.gte('construction_date', fromDate)
    if (toDate) appQ = appQ.lte('construction_date', toDate)

    const { data: apps, error: appErr } = await appQ.order('construction_date', { ascending: false })
    if (appErr) {
      return NextResponse.json({ error: `applications: ${appErr.message}` }, { status: 500 })
    }

    for (const a of apps ?? []) {
      const supply = Number(a.supply_amount ?? 0)
      const vat = Number(a.vat ?? 0)
      const validity = checkValidity({
        business_number: a.business_number,
        business_name: a.business_name,
        owner_name: a.owner_name,
      })
      results.push({
        source: 'application',
        source_id: a.id,
        service_type: a.service_type ?? null,
        business_name: a.business_name,
        business_number: a.business_number ?? null,
        owner_name: a.owner_name,
        address: a.address ?? null,
        email: a.email ?? null,
        phone: a.phone ?? null,
        payment_method: a.payment_method ?? null,
        supply_amount: supply,
        vat,
        total_amount: supply + vat,
        billing_period: null,
        construction_date: a.construction_date ?? null,
        created_at: a.created_at,
        tax_invoice_issued: a.status === APPLICATION_ISSUED_STATUS,
        tax_invoice_issued_at: null,
        ...validity,
      })
    }
  }

  // ── 소스 2: service_billings JOIN customers ─────────
  if (!sourceFilter || sourceFilter === 'billing') {
    let billQ = supabase
      .from('service_billings')
      .select(`
        id,
        customer_id,
        billing_type,
        billing_period,
        amount,
        status,
        tax_invoice_issued,
        tax_invoice_issued_date,
        created_at,
        customers!inner (
          id,
          business_name,
          business_number,
          owner_name,
          address,
          email,
          phone,
          customer_type,
          payment_method
        )
      `)
      .eq('status', 'paid')

    if (!includeIssued) billQ = billQ.eq('tax_invoice_issued', false)
    if (fromDate) billQ = billQ.gte('created_at', `${fromDate}T00:00:00`)
    if (toDate) billQ = billQ.lte('created_at', `${toDate}T23:59:59`)

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

      const amount = Number(b.amount ?? 0)
      // billings 는 amount 만 있음 → VAT 10% 가정으로 분리
      const supply = Math.round(amount / 1.1)
      const vat = amount - supply

      const validity = checkValidity({
        business_number: c.business_number,
        business_name: c.business_name,
        owner_name: c.owner_name,
      })

      results.push({
        source: 'billing',
        source_id: b.id,
        service_type: c.customer_type ?? null,
        business_name: c.business_name,
        business_number: c.business_number ?? null,
        owner_name: c.owner_name,
        address: c.address ?? null,
        email: c.email ?? null,
        phone: c.phone ?? null,
        payment_method: c.payment_method ?? null,
        supply_amount: supply,
        vat,
        total_amount: amount,
        billing_period: b.billing_period ?? null,
        construction_date: null,
        created_at: b.created_at ?? new Date().toISOString(),
        tax_invoice_issued: !!b.tax_invoice_issued,
        tax_invoice_issued_at: b.tax_invoice_issued_date ?? null,
        ...validity,
      })
    }
  }

  return NextResponse.json({
    candidates: results,
    count: results.length,
  })
}
