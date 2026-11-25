import { NextRequest, NextResponse } from 'next/server'
import { resolvePaidPatch } from '@/lib/billing-paid-method'
import { createServiceClient } from '@/lib/supabase/server'
import { sendExtraBillingNotice, type ExtraNoticeResult } from '@/lib/extra-billing-notice'

type Supabase = ReturnType<typeof createServiceClient>

/**
 * 2026-11-08: 1회성 추가 결제는 그 고객의 시공 건(service_applications)에 묶어 둔다.
 *   application_id 를 안 넘기면 삭제되지 않은 가장 최근 신청서를 자동으로 찾는다.
 */
async function resolveApplicationId(supabase: Supabase, customerId: string, given?: string | null): Promise<string | null> {
  if (given) return given
  const { data } = await supabase
    .from('service_applications')
    .select('id')
    .eq('customer_id', customerId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data?.id as string | undefined) ?? null
}

export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const customerId = searchParams.get('customer_id')
  const status = searchParams.get('status')

  if (!customerId) {
    return NextResponse.json({ error: 'customer_id가 필요합니다.' }, { status: 400 })
  }

  let query = supabase
    .from('service_billings')
    .select('*')
    .eq('customer_id', customerId)
    .order('due_date', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ billings: data })
}

export async function POST(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()
  const {
    customer_id, billing_type, billing_period, amount, due_date,
    notes, billing_timing, service_type, application_id, auto_notify, allow_autopay,
  } = body as {
    customer_id?: string; billing_type?: string; billing_period?: string; amount?: number | string; due_date?: string
    notes?: string | null; billing_timing?: string | null; service_type?: string | null
    application_id?: string | null; auto_notify?: boolean
    /** 2026-11-18: 결제 페이지 '정기결제(카드 자동결제)' 선택지 표시 여부. 생략 시 청구 종류 기본값 */
    allow_autopay?: boolean | null
  }

  if (!customer_id || !billing_type || !billing_period || !amount || !due_date) {
    return NextResponse.json({ error: '필수 항목(customer_id, billing_type, billing_period, amount, due_date)이 누락되었습니다.' }, { status: 400 })
  }

  if (!['monthly', 'annual', 'onetime'].includes(billing_type)) {
    return NextResponse.json({ error: "billing_type은 'monthly' | 'annual' | 'onetime' 이어야 합니다." }, { status: 400 })
  }

  if (billing_timing && !['prepaid', 'postpaid'].includes(billing_timing)) {
    return NextResponse.json({ error: "billing_timing은 'prepaid' 또는 'postpaid'이어야 합니다." }, { status: 400 })
  }

  const insertPayload: Record<string, unknown> = {
    customer_id,
    billing_type,
    billing_period,
    amount: Number(amount),
    due_date,
    notes: notes || null,
    status: 'pending',
  }
  if (billing_timing) insertPayload.billing_timing = billing_timing
  if (service_type)   insertPayload.service_type   = service_type
  if (typeof allow_autopay === 'boolean') insertPayload.allow_autopay = allow_autopay
  const isExtra = billing_type === 'onetime' && service_type === '1회성케어'
  if (isExtra) {
    insertPayload.application_id = await resolveApplicationId(supabase, String(customer_id), application_id)
  }

  const { data, error } = await supabase
    .from('service_billings')
    .insert(insertPayload)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 1회성 추가 결제: 잔금 안내와 같은 흐름으로 결제 링크 발급 + 안내 문자 자동 발송
  let notice: ExtraNoticeResult | null = null
  if (isExtra && auto_notify !== false && data?.id) {
    try {
      notice = await sendExtraBillingNotice(supabase, String(data.id), { method: 'auto', source: 'admin/billings POST' })
    } catch (e) {
      notice = { ok: false, reason: 'send_failed', message: e instanceof Error ? e.message : '문자 발송 오류' }
    }
  }
  return NextResponse.json({ billing: data, notice }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()
  const { id, ...rest } = body

  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

  const ALLOWED = [
    'status', 'paid_date', 'notes', 'amount', 'due_date',
    'tax_invoice_issued', 'tax_invoice_issued_date',
    // Phase H.1 (2026-10-18): 결제 링크 수동 입력·자동 생성 저장
    'payment_url', 'payment_portone_id', 'payment_sent_at', 'send_attempts',
    // 2026-11-18: 결제 페이지 정기결제(카드 자동결제) 선택지 표시 여부
    'allow_autopay',
  ]
  const updates: Record<string, unknown> = {}
  for (const key of ALLOWED) {
    if (key in rest) updates[key] = rest[key]
  }

  // 2026-11-25: 실제 결제수단(paid_method)·처리 경로(paid_via)
  //   - 완료로 바꾸면 수단은 입력값 → 예정 수단(payment_method_snapshot) → 고객 마스터 순으로 기본값, 경로는 manual
  //   - 대기·지연으로 되돌리면 두 칸을 비운다
  if ('status' in rest || 'paid_method' in rest || 'paid_via' in rest) {
    const { data: current, error: curErr } = await supabase
      .from('service_billings')
      .select('status, paid_method, paid_via, payment_method_snapshot, customer_id, customers(payment_method)')
      .eq('id', id)
      .maybeSingle()
    if (curErr) return NextResponse.json({ error: curErr.message }, { status: 500 })
    if (!current) return NextResponse.json({ error: '청구서를 찾을 수 없습니다.' }, { status: 404 })
    const customer = current.customers as unknown as { payment_method: string | null } | null
    const resolved = resolvePaidPatch({
      status: typeof rest.status === 'string' ? rest.status : undefined,
      paid_method: 'paid_method' in rest ? (rest.paid_method as string | null) : undefined,
      paid_via: 'paid_via' in rest ? (rest.paid_via as string | null) : undefined,
      current: {
        status: current.status as string,
        paid_method: (current.paid_method as string | null) ?? null,
        paid_via: (current.paid_via as string | null) ?? null,
        payment_method_snapshot: (current.payment_method_snapshot as string | null) ?? null,
      },
      customerMethod: customer?.payment_method ?? null,
    })
    if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 400 })
    Object.assign(updates, resolved.patch)
  }

  const { error } = await supabase
    .from('service_billings')
    .update(updates)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

  const { error } = await supabase
    .from('service_billings')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
