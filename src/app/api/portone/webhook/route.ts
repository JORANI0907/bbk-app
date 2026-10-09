import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from '@portone/server-sdk'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSlack } from '@/lib/slack'

const WEBHOOK_SECRET = process.env.PORTONE_WEBHOOK_SECRET ?? ''
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.bbkorea.co.kr'

// 자동 알림 발송 헬퍼 — fire-and-forget (실패해도 웹훅 성공 처리)
async function triggerAutoNotify(applicationId: string, type: string) {
  try {
    await fetch(`${APP_BASE_URL}/api/admin/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ application_id: applicationId, type, method: 'auto' }),
    })
  } catch {
    // 웹훅 재시도 방지 — 알림 실패는 조용히 무시
  }
}

// Transaction.Paid 웹훅 처리 — 가상계좌 입금 완료 시 DB 업데이트 + 알림
// 카드/계좌이체는 complete 라우트(브라우저 SDK 콜백)에서 이미 처리됨.
// deposit_paid_at/balance_paid_at 이 이미 설정된 건은 중복 처리 방지를 위해 스킵.
async function handleTransactionPaid(paymentId: string) {
  const supabase = createServiceClient()

  // deposit_portone_id 매칭 행 찾기 (deposit_paid_at 포함해 중복 체크)
  const { data: depositRow } = await supabase
    .from('service_applications')
    .select('id, owner_name, business_name, deposit, supply_amount, vat, deposit_paid_at')
    .eq('deposit_portone_id', paymentId)
    .is('deleted_at', null)
    .maybeSingle()

  if (depositRow) {
    // 이미 complete 라우트에서 처리된 건 → 스킵 (카드/계좌이체 중복 알림 방지)
    if (depositRow.deposit_paid_at) return

    const nowIso = new Date().toISOString()
    // 원자적 업데이트: deposit_paid_at IS NULL 인 경우에만 실행 (race condition 방어)
    const { data: updated } = await supabase
      .from('service_applications')
      .update({
        deposit_paid_at: nowIso,
        payment_confirmed_at: nowIso,
        payment_status: 'paid',
        payment_status_detail: '예약금 입금',
        deposit: Number(depositRow.deposit ?? 0),
      })
      .eq('id', depositRow.id)
      .is('deposit_paid_at', null)
      .select('id')

    // 0행 업데이트 = 직전에 다른 요청이 이미 처리함 → 알림 스킵
    if (!updated || updated.length === 0) return

    await triggerAutoNotify(depositRow.id, '예약확정알림')
    return
  }

  const { data: balanceRow } = await supabase
    .from('service_applications')
    .select('id, owner_name, business_name, balance_paid_at')
    .eq('balance_portone_id', paymentId)
    .is('deleted_at', null)
    .maybeSingle()

  if (balanceRow) {
    if (balanceRow.balance_paid_at) return

    const nowIso = new Date().toISOString()
    const { data: updated } = await supabase
      .from('service_applications')
      .update({
        balance_paid_at: nowIso,
        payment_confirmed_at: nowIso,
        payment_status: 'paid',
        payment_status_detail: '결제완료',
      })
      .eq('id', balanceRow.id)
      .is('balance_paid_at', null)
      .select('id')

    if (!updated || updated.length === 0) return

    // customers.balance_paid_at 동기화
    try {
      const { data: link } = await supabase
        .from('service_applications')
        .select('customer_id')
        .eq('id', balanceRow.id)
        .maybeSingle()
      if (link?.customer_id) {
        await supabase
          .from('customers')
          .update({ balance_paid_at: nowIso })
          .eq('id', link.customer_id)
      }
    } catch { /* 동기화 실패 무시 */ }

    // triggerAutoNotify → notify API → Slack 으로 통합 처리 (중복 방지)
    await triggerAutoNotify(balanceRow.id, '결제완료알림(잔금)')
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()

    // 웹훅 시크릿이 설정된 경우에만 서명 검증
    if (WEBHOOK_SECRET) {
      try {
        await Webhook.verify(WEBHOOK_SECRET, rawBody, {
          'webhook-id':        request.headers.get('webhook-id')        ?? '',
          'webhook-timestamp': request.headers.get('webhook-timestamp') ?? '',
          'webhook-signature': request.headers.get('webhook-signature') ?? '',
        })
      } catch {
        return NextResponse.json({ error: '웹훅 서명 검증 실패' }, { status: 401 })
      }
    }

    const event = JSON.parse(rawBody) as Record<string, unknown>
    const type      = String(event.type ?? '')
    const paymentId = String((event.data as Record<string,unknown>)?.paymentId ?? '')

    switch (type) {
      case 'Transaction.Paid':
        await handleTransactionPaid(paymentId)
        break
      case 'Transaction.VirtualAccountIssued':
        // 가상계좌 발급 이벤트 (이미 issue-payment-link에서 처리됨, 로그만)
        await sendSlack(`📋 가상계좌 발급 웹훅 수신: ${paymentId}`).catch(() => {})
        break
      case 'Transaction.Failed':
        await sendSlack(`❌ 포트원 결제 실패 웹훅: ${paymentId}`).catch(() => {})
        break
      default:
        // 미처리 이벤트 무시
        break
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
