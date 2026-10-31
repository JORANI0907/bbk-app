/**
 * 정기 청구서 카드 결제 검증 (2026-11-01)
 *
 * 결제 페이지(/portone/billing-pay)에서 카드 결제창이 닫힌 뒤 호출.
 *   1) 청구서의 payment_portone_id 와 요청 paymentId 일치 확인 (위변조 방지)
 *   2) PortOne 서버에 결제 상태 조회 → PAID 이고 금액이 청구액과 같을 때만 인정
 *   3) handleTransactionPaid 로 service_billings.status='paid' + Slack + 결제완료 알림 (웹훅과 같은 경로, 멱등)
 *
 * POST { billingId, paymentId }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getPortOneClient, isPortOneEnabled } from '@/lib/portone'
import { handleTransactionPaid } from '@/lib/portone-payment-handler'

export async function POST(request: NextRequest) {
  try {
    if (!isPortOneEnabled()) {
      return NextResponse.json({ error: '포트원 미설정' }, { status: 503 })
    }
    const body = await request.json() as { billingId?: string; paymentId?: string }
    const { billingId, paymentId } = body
    if (!billingId || !paymentId) {
      return NextResponse.json({ error: 'billingId, paymentId 가 필요합니다' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: billing } = await supabase
      .from('service_billings')
      .select('id, amount, status, payment_portone_id')
      .eq('id', billingId)
      .maybeSingle()
    if (!billing) return NextResponse.json({ error: '청구서를 찾을 수 없습니다' }, { status: 404 })
    if (billing.payment_portone_id !== paymentId) {
      return NextResponse.json({ error: '결제 ID가 일치하지 않습니다' }, { status: 400 })
    }
    if (billing.status === 'paid') {
      return NextResponse.json({ success: true, status: 'PAID', alreadyProcessed: true })
    }

    const client = getPortOneClient()!
    const payment = await client.payment.getPayment({ paymentId }) as {
      status?: string
      amount?: { total?: number }
      method?: { type?: string; bank?: string; accountNumber?: string; expiredAt?: string }
    }
    const status = String(payment.status ?? '')
    if (status === 'VIRTUAL_ACCOUNT_ISSUED') {
      // 모바일 가상계좌 흐름 복귀용: 발급된 계좌 정보를 돌려준다 (입금되면 webhook 이 paid 처리)
      const m = payment.method ?? {}
      return NextResponse.json({
        success: false, status,
        virtualAccount: { bankCode: m.bank ?? null, accountNumber: m.accountNumber ?? null, expiry: m.expiredAt ?? null },
      })
    }
    if (status !== 'PAID') {
      return NextResponse.json({ success: false, status, error: '아직 결제가 완료되지 않았습니다' }, { status: 409 })
    }
    const paidAmount = Number(payment.amount?.total ?? 0)
    const expected = Number(billing.amount ?? 0)
    if (paidAmount !== expected) {
      return NextResponse.json(
        { success: false, status, error: `결제 금액 불일치 (예상 ${expected}원 / 실제 ${paidAmount}원)` },
        { status: 400 },
      )
    }

    await handleTransactionPaid(paymentId)
    return NextResponse.json({ success: true, status: 'PAID', paidAmount })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
