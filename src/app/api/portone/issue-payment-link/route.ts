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
  console.log('[issue-payment-link] START')
  try {
    if (!isPortOneEnabled()) {
      console.log('[issue-payment-link] PortOne disabled')
      return NextResponse.json({ error: '포트원 미설정 (환경변수 확인 필요)' }, { status: 503 })
    }

    const body = await request.json() as {
      applicationId?: string
      customerId?: string
      stage: 'deposit' | 'balance'
      overridePaymentMethod?: '카드(온라인 간편결제)' | '가상계좌' | '계좌이체'
    }
    const { applicationId, customerId, stage, overridePaymentMethod } = body
    if ((!applicationId && !customerId) || !stage) {
      return NextResponse.json({ error: '필수 항목 누락 (applicationId 또는 customerId 필요)' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Phase A-4: customer 모드 지원. 필드 매핑 후 동일 로직 재사용.
    const isCustomerMode = !!customerId
    const table = isCustomerMode ? 'customers' : 'service_applications'
    const recordId = (customerId ?? applicationId)!

    // 결제방법 override: 신청서/고객의 payment_method 를 요청 값으로 업데이트
    // 기존 결제링크(deposit_portone_id·balance_portone_id·URL·가상계좌 정보) 초기화 → 새 결제방법으로 재발급
    if (overridePaymentMethod) {
      const resetUpdates: Record<string, unknown> = { payment_method: overridePaymentMethod }
      if (stage === 'deposit') {
        resetUpdates.deposit_portone_id = null
        resetUpdates.deposit_payment_url = null
      } else {
        resetUpdates.balance_portone_id = null
        resetUpdates.balance_payment_url = null
      }
      // 가상계좌 정보는 service_applications 에만 존재
      if (!isCustomerMode) {
        resetUpdates.virtual_account_number = null
        resetUpdates.virtual_account_bank = null
        resetUpdates.virtual_account_expired_at = null
      }
      await supabase.from(table).update(resetUpdates).eq('id', recordId)
    }

    const { data: rawRecord } = await supabase
      .from(table)
      .select('*')
      .eq('id', recordId)
      .is('deleted_at', null)
      .single()

    if (!rawRecord) {
      return NextResponse.json({ error: isCustomerMode ? '고객을 찾을 수 없습니다.' : '신청서를 찾을 수 없습니다.' }, { status: 404 })
    }

    // customer 필드를 application 형태로 정규화 (기존 코드 재사용)
    const app: Record<string, unknown> = isCustomerMode
      ? {
          ...rawRecord,
          owner_name: rawRecord.contact_name,
          phone: rawRecord.contact_phone,
        }
      : rawRecord

    const pm = String(app.payment_method ?? '')
    const isCard     = pm === '카드(온라인 간편결제)'
    // 가상계좌: 신규 옵션('가상계좌') + 기존 옵션('현금(계산서 희망)') 통합 (레거시 데이터 호환)
    const isVbank    = pm === '가상계좌' || pm === '현금(계산서 희망)'
    const isTransfer = pm === '계좌이체'

    if (!isCard && !isVbank && !isTransfer) {
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

    const paymentId   = generatePaymentId(recordId, stage)
    const orderName   = `BBK 공간케어 ${stage === 'deposit' ? '예약금' : '잔금'} — ${String(app.business_name ?? '')}`
    const customerName = String(app.owner_name ?? '')
    const phone = String(app.phone ?? '').replace(/-/g, '')

    // ─── 카드 or 실시간 계좌이체: 브라우저 SDK 결제 페이지 URL 생성 (서버는 사전등록만) ──
    // 두 결제수단 모두 client-side flow(brower SDK → complete API). 결제수단 분기는 pay 페이지에서
    // app.payment_method를 조회해 payMethod('CARD' | 'TRANSFER')를 결정한다.
    if (isCard || isTransfer) {
      console.log('[issue-payment-link] 카드/계좌이체 분기 진입', { pm, amount, paymentId })
      const client = getPortOneClient()!
      try {
        await client.payment.preRegisterPayment({
          paymentId,
          storeId: getStoreId(),
          totalAmount: amount,
          currency: 'KRW',
        })
        console.log('[issue-payment-link] preRegisterPayment 성공')
      } catch (regErr) {
        console.error('[issue-payment-link] preRegisterPayment 실패:', regErr)
        throw regErr
      }

      const idParam = isCustomerMode ? `custId=${recordId}` : `appId=${recordId}`
      const paymentUrl = `${APP_BASE_URL}/portone/pay/${paymentId}?stage=${stage}&${idParam}`

      const { error: updateErr } = await supabase
        .from(table)
        .update({
          [existingIdField]: paymentId,
          [existingUrlField]: paymentUrl,
        })
        .eq('id', recordId)
      if (updateErr) console.error('[issue-payment-link] update 실패:', updateErr)

      console.log('[issue-payment-link] SUCCESS 반환:', paymentUrl)
      return NextResponse.json({ success: true, paymentUrl, paymentId })
    }

    // ─── 가상계좌: 서버사이드 직접 발급 ────────────────────────────────────
    const client    = getPortOneClient()!
    const channelKey = getChannelKey('vbank')

    // KG 이니시스 가상계좌는 customer.email이 필수 (REQUIRED 룰)
    const emailFromApp = String(app.email ?? '').trim()
    const emailForVbank = emailFromApp
      || `noemail-${recordId.replace(/-/g, '').slice(0, 8)}@bbkorea.co.kr`

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
        email: emailForVbank,
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

    const idParamVbank = isCustomerMode ? `custId=${recordId}` : `appId=${recordId}`
    const paymentUrl = `${APP_BASE_URL}/portone/pay/${paymentId}?stage=${stage}&${idParamVbank}`

    // 가상계좌 정보는 신청서(service_applications)에만 필드가 존재 — customer 모드는 스킵
    const vbankUpdates = isCustomerMode
      ? { [existingIdField]: paymentId, [existingUrlField]: paymentUrl }
      : {
          [existingIdField]: paymentId,
          [existingUrlField]: paymentUrl,
          virtual_account_number: accountNumber,
          virtual_account_bank: bankName,
          ...(expiredAt ? { virtual_account_expired_at: expiredAt } : {}),
        }

    await supabase
      .from(table)
      .update(vbankUpdates)
      .eq('id', recordId)

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
