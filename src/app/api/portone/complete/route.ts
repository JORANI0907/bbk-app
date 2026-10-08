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
    const { paymentId, applicationId, customerId, stage, billingKey } = body
    if (!paymentId || (!applicationId && !customerId) || !stage) {
      return NextResponse.json({ error: '필수 항목 누락 (paymentId, applicationId 또는 customerId, stage 필요)' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const isCustomerMode = !!customerId && !applicationId
    const recordId = (applicationId ?? customerId)!
    const dbTable  = isCustomerMode ? 'customers' : 'service_applications'

    type AppRecord = {
      supply_amount: number | null
      vat: number | null
      deposit: number | null
      deposit_portone_id: string | null
      balance_portone_id: string | null
      business_name: string | null
      // service_applications: owner_name / phone
      // customers: contact_name / contact_phone
      owner_name?: string | null
      contact_name?: string | null
      phone?: string | null
      contact_phone?: string | null
    }
    const selectFields = isCustomerMode
      ? 'supply_amount, vat, deposit, deposit_portone_id, balance_portone_id, business_name, contact_name, contact_phone'
      : 'supply_amount, vat, deposit, deposit_portone_id, balance_portone_id, business_name, owner_name, phone'
    const { data: rawRecord, error: fetchError } = await supabase
      .from(dbTable)
      .select(selectFields)
      .eq('id', recordId)
      .single()
    if (fetchError) {
      console.error('[complete] DB 조회 오류:', fetchError.message, { recordId, dbTable })
    }

    if (!rawRecord) {
      return NextResponse.json({ error: isCustomerMode ? '고객을 찾을 수 없습니다.' : '신청서를 찾을 수 없습니다.' }, { status: 404 })
    }

    const app = rawRecord as AppRecord
    const ownerName = isCustomerMode ? (app.contact_name ?? '') : (app.owner_name ?? '')
    const ownerPhone = isCustomerMode ? (app.contact_phone ?? '') : (app.phone ?? '')

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
      const customerName = ownerName
      const phone        = ownerPhone.replace(/-/g, '')

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
      // READY → PAID 전환에 지연이 있을 수 있어 최대 20회(10초) 폴링
      console.log('[complete] getPayment 호출:', { paymentId })
      let payment = await client.payment.getPayment({ paymentId })
      let paymentStatus = String((payment as { status?: string })?.status ?? '')
      console.log('[complete] getPayment 초기 응답:', {
        status: paymentStatus,
        fullResponse: JSON.stringify(payment).slice(0, 1000),
      })
      for (let i = 0; i < 20 && paymentStatus === 'READY'; i++) {
        await new Promise((r) => setTimeout(r, 500))
        payment = await client.payment.getPayment({ paymentId })
        paymentStatus = String((payment as { status?: string })?.status ?? '')
        console.log(`[complete] polling ${i + 1}/20 status=`, paymentStatus)
      }
      if (paymentStatus !== 'PAID') {
        console.log('[complete] 최종 실패 응답:', JSON.stringify(payment).slice(0, 3000))
        // PortOne V2 FAILED/READY 응답에서 상세 거절 사유 추출
        const failure = (payment as { failure?: { reason?: string; pgCode?: string; pgMessage?: string } })?.failure
        const pgCode    = failure?.pgCode ?? ''
        const pgMessage = failure?.pgMessage ?? ''
        const reason    = failure?.reason ?? ''
        console.log('[complete] 거절 사유 상세:', { status: paymentStatus, reason, pgCode, pgMessage })

        const isStillReady = paymentStatus === 'READY'
        let errMsg: string
        if (isStillReady) {
          errMsg = '결제 승인 대기 중입니다. 잠시 후 결제 확인 안내가 도착합니다.'
        } else if (reason || pgMessage || pgCode) {
          // 사용자에게 실제 거절 사유 노출 (KG이니시스 메시지 포함)
          const parts = [reason, pgMessage].filter(Boolean).join(' / ')
          errMsg = `결제가 거절되었습니다: ${parts || '사유 불명'}${pgCode ? ` (코드: ${pgCode})` : ''}`
        } else {
          errMsg = `결제가 완료되지 않았습니다. (상태: ${paymentStatus || '알 수 없음'})`
        }
        return NextResponse.json({
          error: errMsg,
          status: paymentStatus,
          failure: { reason, pgCode, pgMessage },
        }, { status: 400 })
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
      payment_status_detail: stage === 'deposit' ? '예약금 입금' : '결제완료',
    }
    // customers 테이블엔 payment_confirmed_at / payment_status(enum) 컬럼이 없음
    if (!isCustomerMode) {
      updates.payment_confirmed_at = nowIso
      updates.payment_status = 'paid'
    }

    if (stage === 'deposit') {
      updates.deposit_paid_at = nowIso
      updates.deposit = expectedAmount
      if (billingKey) updates.billing_key = billingKey
    } else {
      updates.balance_paid_at = nowIso
    }

    await supabase
      .from(dbTable)
      .update(updates)
      .eq('id', recordId)

    // Slack 알림
    const stageLabel = stage === 'deposit' ? '예약금(1차)' : '잔금(2차)'
    sendSlack(
      `💳 *${stageLabel} 결제 완료*\n` +
      `업체: ${String(app.business_name ?? '-')}` +
      ` / 고객: ${ownerName || '-'}\n` +
      `금액: ${expectedAmount.toLocaleString('ko-KR')}원\n` +
      `결제ID: ${paymentId}`,
    ).catch(() => {})

    // 자동 알림은 service_applications 모드에서만 (customers 모드는 알림 플로우 없음)
    if (!isCustomerMode && applicationId) {
      if (stage === 'deposit') {
        await triggerAutoNotify(applicationId, '예약확정알림')
      } else {
        // G4: 잔금 완료 → 결제완료 알림
        await triggerAutoNotify(applicationId, '결제완료알림(잔금)')
      }
    }

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
