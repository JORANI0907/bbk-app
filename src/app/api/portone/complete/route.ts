import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getPortOneClient, getStoreId, isPortOneEnabled, calcBalance } from '@/lib/portone'
import { sendSlack } from '@/lib/slack'

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.bbkorea.co.kr'

// 자동 알림 발송 헬퍼 — fire-and-forget (실패해도 결제 처리 성공 유지)
async function triggerAutoNotify(applicationId: string, type: string) {
  try {
    await fetch(`${APP_BASE_URL}/api/admin/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ application_id: applicationId, type, method: 'auto' }),
    })
  } catch {
    // 알림 실패는 조용히 무시 (결제 자체는 이미 성공)
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isPortOneEnabled()) {
      return NextResponse.json({ error: '포트원 미설정' }, { status: 503 })
    }

    const body = await request.json() as {
      paymentId: string
      applicationId?: string
      customerId?: string  // Phase A-4: 고객 모드 (kg-audit 등)
      stage: 'deposit' | 'balance'
      billingKey?: string  // 정기결제(BillPay) 흐름에서만 사용, 일반결제엔 없음
    }
    const { paymentId, applicationId, stage, billingKey } = body
    if (!paymentId || !applicationId || !stage) {
      return NextResponse.json({ error: '필수 항목 누락 (paymentId, applicationId, stage 필요)' }, { status: 400 })
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

    if (billingKey) {
      // ─── 정기결제(BillPay) 흐름 — 서버가 저장된 billingKey로 재청구 ───
      const orderName    = `BBK 공간케어 ${stage === 'deposit' ? '예약금' : '잔금'} — ${String(app.business_name ?? '')}`
      const customerName = String(app.owner_name ?? '')
      const phone        = (app.phone ?? '').replace(/-/g, '')

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
    } else {
      // ─── 일반결제 흐름 (카드/실시간계좌이체) — 브라우저 SDK가 결제창 처리 후 서버는 검증만 ───
      // PortOne V2에서 getPayment로 실제 결제 상태와 금액 확인 → 위변조 방지
      // READY → PAID 전환에 지연이 있을 수 있어 최대 5회(2.5초) 폴링
      console.log('[complete] getPayment 호출:', { paymentId })
      let payment = await client.payment.getPayment({ paymentId })
      let paymentStatus = String((payment as { status?: string })?.status ?? '')
      console.log('[complete] getPayment 초기 응답:', {
        status: paymentStatus,
        fullResponse: JSON.stringify(payment).slice(0, 1000),
      })
      for (let i = 0; i < 5 && paymentStatus === 'READY'; i++) {
        await new Promise((r) => setTimeout(r, 500))
        payment = await client.payment.getPayment({ paymentId })
        paymentStatus = String((payment as { status?: string })?.status ?? '')
        console.log(`[complete] polling ${i + 1}/5 status=`, paymentStatus)
      }
      if (paymentStatus !== 'PAID') {
        console.log('[complete] 최종 실패 응답:', JSON.stringify(payment).slice(0, 2000))
        // READY 그대로 남으면 웹훅으로 나중에 처리됨 → 사용자에게 명확히 안내
        const isStillReady = paymentStatus === 'READY'
        const errMsg = isStillReady
          ? '결제 승인 대기 중입니다. 잠시 후 결제 확인 안내가 도착합니다.'
          : `결제가 완료되지 않았습니다. (상태: ${paymentStatus || '알 수 없음'})`
        return NextResponse.json({ error: errMsg, status: paymentStatus }, { status: 400 })
      }
      // 금액 위변조 검증 — PortOne 실제 결제 금액과 서버 계산 금액 비교
      const paidAmount = Number((payment as { amount?: { total?: number } })?.amount?.total ?? 0)
      if (paidAmount !== expectedAmount) {
        return NextResponse.json(
          { error: `결제 금액 불일치 (예상 ${expectedAmount}원 / 실제 ${paidAmount}원)` },
          { status: 400 },
        )
      }
    }

    const nowIso = new Date().toISOString()
    const updates: Record<string, unknown> = {
      payment_confirmed_at: nowIso,
      // 결제 완료 시 상태 자동 승격 (DB CHECK: pending/invoiced/paid/overdue)
      payment_status: 'paid',
      // 관리자 UI 드롭다운 표시 값 자동 세팅 (사람 친화적 라벨)
      payment_status_detail: stage === 'deposit' ? '예약금 입금' : '결제완료',
    }

    if (stage === 'deposit') {
      updates.deposit_paid_at = nowIso
      // billingKey는 정기결제 흐름에서만 저장 (일반결제엔 없음)
      if (billingKey) updates.billing_key = billingKey
    } else {
      updates.balance_paid_at = nowIso
    }

    await supabase
      .from('service_applications')
      .update(updates)
      .eq('id', applicationId)

    // Slack 알림 — 카드/실시간계좌이체 결제 완료 알림 (사장님 즉시 알림)
    const stageLabel = stage === 'deposit' ? '예약금(1차)' : '잔금(2차)'
    sendSlack(
      `💳 *${stageLabel} 결제 완료*\n` +
      `업체: ${String(app.business_name ?? '-')}` +
      ` / 고객: ${String(app.owner_name ?? '-')}\n` +
      `금액: ${expectedAmount.toLocaleString('ko-KR')}원\n` +
      `결제ID: ${paymentId}`,
    ).catch(() => {})

    // G2: 카드 예약금 → '예약금 입금완료 알림' 자동 SMS
    // G4: 카드 잔금   → '결제완료알림(잔금)' 자동 SMS
    const notifyType = stage === 'deposit' ? '예약금 입금완료 알림' : '결제완료알림(잔금)'
    await triggerAutoNotify(applicationId, notifyType)

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
