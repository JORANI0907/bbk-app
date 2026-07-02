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
      billingKey: string
    }
    const { paymentId, applicationId, stage, billingKey } = body
    if (!paymentId || !applicationId || !stage || !billingKey) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: app } = await supabase
      .from('service_applications')
      .select('supply_amount, vat, deposit, deposit_portone_id, balance_portone_id, business_name, owner_name, phone')
      .eq('id', applicationId)
      .single()

    if (!app) {
      return NextResponse.json({ error: '신청서를 찾을 수 없습니다.' }, { status: 404 })
    }

    // paymentId 위변조 방지 검증
    const expectedId = stage === 'deposit' ? app.deposit_portone_id : app.balance_portone_id
    if (expectedId !== paymentId) {
      return NextResponse.json({ error: '결제 ID가 일치하지 않습니다.' }, { status: 400 })
    }

    // 금액 서버사이드 계산
    const supply  = Number(app.supply_amount ?? 0)
    const vat     = Number(app.vat ?? 0)
    const deposit = Number(app.deposit ?? 0)
    const expectedAmount = stage === 'deposit' ? deposit : calcBalance(supply, vat, deposit)

    if (expectedAmount <= 0) {
      return NextResponse.json({ error: '결제 금액이 0원입니다.' }, { status: 400 })
    }

    const client = getPortOneClient()!
    const orderName    = `BBK 공간케어 ${stage === 'deposit' ? '예약금' : '잔금'} — ${String(app.business_name ?? '')}`
    const customerName = String(app.owner_name ?? '')
    const phone        = (app.phone ?? '').replace(/-/g, '')

    // 빌링키로 즉시 청구 (KG이니시스 V2 지원 방식)
    await client.payment.payWithBillingKey({
      paymentId,
      storeId: getStoreId(),
      billingKey,
      orderName,
      amount: { total: expectedAmount },
      currency: 'KRW',
      customer: {
        name: { full: customerName },
        ...(phone ? { phoneNumber: phone } : {}),
      },
    })

    const nowIso = new Date().toISOString()
    const updates: Record<string, unknown> = { payment_confirmed_at: nowIso }

    if (stage === 'deposit') {
      updates.deposit_paid_at = nowIso
      updates.billing_key = billingKey
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
      paidAmount: expectedAmount,
      billingKeySaved: stage === 'deposit',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
