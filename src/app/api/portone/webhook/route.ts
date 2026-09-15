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

// 가상계좌 입금 완료 시 service_applications 업데이트
async function handleVirtualAccountPaid(paymentId: string) {
  const supabase = createServiceClient()

  // deposit_portone_id 또는 balance_portone_id 중 해당하는 행 찾기
  const { data: depositRow } = await supabase
    .from('service_applications')
    .select('id, owner_name, business_name, deposit, supply_amount, vat')
    .eq('deposit_portone_id', paymentId)
    .is('deleted_at', null)
    .maybeSingle()

  if (depositRow) {
    const nowIso = new Date().toISOString()
    await supabase
      .from('service_applications')
      .update({
        deposit_paid_at: nowIso,
        payment_confirmed_at: nowIso,
        payment_status: 'paid',
        payment_status_detail: '예약금 입금',
      })
      .eq('id', depositRow.id)

    await sendSlack(
      `💳 *가상계좌 예약금 입금 완료*\n` +
      `업체: ${depositRow.business_name ?? '-'} / 고객: ${depositRow.owner_name ?? '-'}\n` +
      `결제ID: ${paymentId}`
    ).catch(() => {})

    // G1: 고객에게 예약금 입금완료 SMS 자동 발송
    await triggerAutoNotify(depositRow.id, '예약금 입금완료 알림')
    return
  }

  const { data: balanceRow } = await supabase
    .from('service_applications')
    .select('id, owner_name, business_name')
    .eq('balance_portone_id', paymentId)
    .is('deleted_at', null)
    .maybeSingle()

  if (balanceRow) {
    const nowIso = new Date().toISOString()
    await supabase
      .from('service_applications')
      .update({
        balance_paid_at: nowIso,
        payment_confirmed_at: nowIso,
        payment_status: 'paid',
        payment_status_detail: '결제완료',
      })
      .eq('id', balanceRow.id)

    await sendSlack(
      `💳 *가상계좌 잔금 입금 완료*\n` +
      `업체: ${balanceRow.business_name ?? '-'} / 고객: ${balanceRow.owner_name ?? '-'}\n` +
      `결제ID: ${paymentId}`
    ).catch(() => {})

    // G4: 고객에게 잔금 결제완료 SMS 자동 발송
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
        await handleVirtualAccountPaid(paymentId)
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
