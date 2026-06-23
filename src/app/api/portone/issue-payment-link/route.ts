import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  getPortOneClient,
  getStoreId,
  getChannelKey,
  generatePaymentId,
  isPortOneEnabled,
  calcBalance,
} from '@/lib/portone'

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.bbkorea.co.kr'

export async function POST(request: NextRequest) {
  try {
    if (!isPortOneEnabled()) {
      return NextResponse.json({ error: '포트원 미설정 (환경변수 확인 필요)' }, { status: 503 })
    }

    const body = await request.json() as {
      applicationId: string
      stage: 'deposit' | 'balance'
    }
    const { applicationId, stage } = body
    if (!applicationId || !stage) {
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

    const pm = String(app.payment_method ?? '')
    const isCard  = pm === '카드(온라인 간편결제)'
    const isVbank = pm === '현금(계산서 희망)'

    if (!isCard && !isVbank) {
      return NextResponse.json(
        { error: `결제수단 '${pm}'은(는) 포트원 결제 대상이 아닙니다.` },
        { status: 400 },
      )
    }

    const supply  = Number(app.supply_amount ?? 0)
    const vat     = Number(app.vat ?? 0)
    const deposit = Number(app.deposit ?? 0)
    const balance = calcBalance(supply, vat, deposit)
    const amount  = stage === 'deposit' ? deposit : balance

    if (amount <= 0) {
      return NextResponse.json({ error: `${stage === 'deposit' ? '예약금' : '잔금'} 금액이 0원입니다.` }, { status: 400 })
    }

    // 기존 링크 재사용: 이미 paymentId가 있으면 동일 URL 반환
    const existingUrlField = stage === 'deposit' ? 'deposit_payment_url' : 'balance_payment_url'
    const existingIdField  = stage === 'deposit' ? 'deposit_portone_id'   : 'balance_portone_id'
    if (app[existingIdField] && app[existingUrlField]) {
      return NextResponse.json({
        success: true,
        reused: true,
        paymentUrl: app[existingUrlField],
        paymentId: app[existingIdField],
      })
    }

    const paymentId   = generatePaymentId(applicationId, stage)
    const orderName   = `BBK 공간케어 ${stage === 'deposit' ? '예약금' : '잔금'} — ${String(app.business_name ?? '')}`
    const customerName = String(app.owner_name ?? '')
    const phone = (app.phone ?? '').replace(/-/g, '')

    // ─── 카드: 브라우저 SDK 결제 페이지 URL 생성 (서버사이드는 사전등록만) ──
    if (isCard) {
      const client = getPortOneClient()!
      await client.payment.preRegisterPayment({
        paymentId,
        storeId: getStoreId(),
        totalAmount: amount,
        currency: 'KRW',
      })

      const paymentUrl = `${APP_BASE_URL}/portone/pay/${paymentId}?stage=${stage}&appId=${applicationId}`

      await supabase
        .from('service_applications')
        .update({
          [existingIdField]: paymentId,
          [existingUrlField]: paymentUrl,
        })
        .eq('id', applicationId)

      return NextResponse.json({ success: true, paymentUrl, paymentId })
    }

    // ─── 가상계좌: 서버사이드 직접 발급 ────────────────────────────────────
    const client    = getPortOneClient()!
    const channelKey = getChannelKey('vbank')

    const vbankResult = await client.payment.payInstantly({
      paymentId,
      storeId: getStoreId(),
      channelKey,
      method: {
        virtualAccount: {
          bank: 'HANA',
          expiry: { validHours: 24 * 7 },
          option: { type: 'NORMAL' },
          remitteeName: '범빌드코리아',
        },
      },
      orderName,
      amount: { total: amount },
      currency: 'KRW',
      customer: {
        name: { full: customerName },
        ...(phone ? { phoneNumber: phone } : {}),
      },
      noticeUrls: [`${APP_BASE_URL}/api/portone/webhook`],
    })

    // 가상계좌 정보 추출
    const vbankInfo = (vbankResult as Record<string, unknown>)
    const accountNumber  = String((vbankInfo.virtualAccount as Record<string,unknown>)?.accountNumber ?? '')
    const bankName       = String((vbankInfo.virtualAccount as Record<string,unknown>)?.bankName ?? '')
    const expiredAtRaw   = (vbankInfo.virtualAccount as Record<string,unknown>)?.accountExpiry
    const expiredAt      = expiredAtRaw ? new Date(String(expiredAtRaw)).toISOString() : null

    const paymentUrl = `${APP_BASE_URL}/portone/pay/${paymentId}?stage=${stage}&appId=${applicationId}`

    await supabase
      .from('service_applications')
      .update({
        [existingIdField]: paymentId,
        [existingUrlField]: paymentUrl,
        virtual_account_number: accountNumber,
        virtual_account_bank: bankName,
        ...(expiredAt ? { virtual_account_expired_at: expiredAt } : {}),
      })
      .eq('id', applicationId)

    return NextResponse.json({
      success: true,
      paymentUrl,
      paymentId,
      virtualAccount: { accountNumber, bankName, expiredAt },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
