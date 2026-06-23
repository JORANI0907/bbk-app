import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  getPortOneClient,
  getStoreId,
  isPortOneEnabled,
  generatePaymentId,
  calcBalance,
} from '@/lib/portone'

export async function POST(request: NextRequest) {
  try {
    if (!isPortOneEnabled()) {
      return NextResponse.json({ error: '포트원 미설정' }, { status: 503 })
    }

    const body = await request.json() as { applicationId: string }
    const { applicationId } = body
    if (!applicationId) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: app } = await supabase
      .from('service_applications')
      .select('*')
      .eq('id', applicationId)
      .is('deleted_at', null)
      .single()

    if (!app) {
      return NextResponse.json({ error: '신청서를 찾을 수 없습니다.' }, { status: 404 })
    }
    if (!app.billing_key) {
      return NextResponse.json({ error: '등록된 빌링키가 없습니다. 카드 예약금 결제 후 이용 가능합니다.' }, { status: 400 })
    }
    if (app.balance_paid_at) {
      return NextResponse.json({ error: '잔금이 이미 결제되었습니다.' }, { status: 400 })
    }

    const supply  = Number(app.supply_amount ?? 0)
    const vat     = Number(app.vat ?? 0)
    const deposit = Number(app.deposit ?? 0)
    const balance = calcBalance(supply, vat, deposit)

    if (balance <= 0) {
      return NextResponse.json({ error: '잔금이 0원입니다.' }, { status: 400 })
    }

    // 잔금 paymentId 생성 (이미 있으면 재사용)
    const balancePaymentId = app.balance_portone_id ?? generatePaymentId(applicationId, 'balance')
    const orderName = `BBK 공간케어 잔금 — ${String(app.business_name ?? '')}`
    const customerName = String(app.owner_name ?? '')
    const phone = (app.phone ?? '').replace(/-/g, '')

    const client = getPortOneClient()!

    await client.payment.payWithBillingKey({
      paymentId: balancePaymentId,
      storeId: getStoreId(),
      billingKey: String(app.billing_key),
      orderName,
      amount: { total: balance },
      currency: 'KRW',
      customer: {
        name: { full: customerName },
        ...(phone ? { phoneNumber: phone } : {}),
      },
    })

    const nowIso = new Date().toISOString()
    await supabase
      .from('service_applications')
      .update({
        balance_portone_id: balancePaymentId,
        balance_paid_at: nowIso,
        payment_confirmed_at: nowIso,
      })
      .eq('id', applicationId)

    return NextResponse.json({ success: true, balancePaymentId, chargedAmount: balance })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
