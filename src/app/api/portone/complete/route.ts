import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getPortOneClient, getStoreId, isPortOneEnabled, calcBalance } from '@/lib/portone'

export async function POST(request: NextRequest) {
  try {
    if (!isPortOneEnabled()) {
      return NextResponse.json({ error: '포트원 미설정' }, { status: 503 })
    }

    const body = await request.json() as {
      paymentId: string
      applicationId: string
      stage: 'deposit' | 'balance'
    }
    const { paymentId, applicationId, stage } = body
    if (!paymentId || !applicationId || !stage) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
    }

    const client = getPortOneClient()!
    const payment = await client.payment.getPayment({ paymentId, storeId: getStoreId() })

    if ((payment as Record<string,unknown>).status !== 'PAID') {
      return NextResponse.json({ error: '결제가 완료되지 않았습니다.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: app } = await supabase
      .from('service_applications')
      .select('supply_amount, vat, deposit, deposit_portone_id, balance_portone_id')
      .eq('id', applicationId)
      .single()

    if (!app) {
      return NextResponse.json({ error: '신청서를 찾을 수 없습니다.' }, { status: 404 })
    }

    // paymentId가 실제 DB에 등록된 것과 일치하는지 검증 (위변조 방지)
    const expectedId = stage === 'deposit' ? app.deposit_portone_id : app.balance_portone_id
    if (expectedId !== paymentId) {
      return NextResponse.json({ error: '결제 ID가 일치하지 않습니다.' }, { status: 400 })
    }

    // 금액 검증
    const supply  = Number(app.supply_amount ?? 0)
    const vat     = Number(app.vat ?? 0)
    const deposit = Number(app.deposit ?? 0)
    const expectedAmount = stage === 'deposit' ? deposit : calcBalance(supply, vat, deposit)
    const paidAmount = Number((payment as Record<string,unknown>).totalAmount ?? 0)

    if (paidAmount !== expectedAmount) {
      return NextResponse.json({ error: `금액 불일치: 예상 ${expectedAmount}원, 실제 ${paidAmount}원` }, { status: 400 })
    }

    // 빌링키 추출 (카드 결제의 경우)
    const billingKey = (payment as Record<string,unknown>).billingKey as string | undefined
    const nowIso = new Date().toISOString()

    const updates: Record<string, unknown> = {
      payment_confirmed_at: nowIso,
    }
    if (stage === 'deposit') {
      updates.deposit_paid_at = nowIso
      if (billingKey) updates.billing_key = billingKey
    } else {
      updates.balance_paid_at = nowIso
    }

    await supabase
      .from('service_applications')
      .update(updates)
      .eq('id', applicationId)

    return NextResponse.json({
      success: true,
      stage,
      paidAmount,
      billingKeySaved: Boolean(billingKey),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
