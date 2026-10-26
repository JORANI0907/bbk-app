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
import { normalizePaymentMethod } from '@/lib/payment-methods'
import { isValidBBKVBankCode, DEFAULT_VBANK_CODE } from '@/lib/portone-banks'
import { resolvePaymentEmail } from '@/lib/payment-email'

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
      // 2026-10-06 재설계: 레거시 한글 enum + 신규 영문 enum 모두 지원
      // 2026-10-12 법인카드(corporate_card) 통합 — credit_card만 받음
      overridePaymentMethod?:
        | '카드(온라인 간편결제)' | '가상계좌' | '계좌이체'  // 레거시
        | 'credit_card' | 'bank_transfer' | 'virtual_account'  // 신규
      // 2026-10-12 가상계좌 UX 개편: 고객이 선택한 은행 코드 (PortOne Bank enum)
      vbankCode?: string
    }
    let { applicationId, customerId } = body
    const { stage, overridePaymentMethod, vbankCode } = body
    if ((!applicationId && !customerId) || !stage) {
      return NextResponse.json({ error: '필수 항목 누락 (applicationId 또는 customerId 필요)' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // 2026-10-13 URL 통일: customerId 모드로 호출되었더라도 해당 고객의 service_applications
    //   레코드가 있으면 자동으로 applicationId 모드로 전환.
    //   효과: "진행흐름(고객관리)" 생성 URL == "배정관리(작업완료알림)" 생성 URL 로 수렴.
    //   같은 고객에 대해 어느 UI 경로로 생성해도 동일한 결제 URL 반환.
    //   service_application 이 없으면(예: /kg-audit 심사용 고객) customer 모드 유지.
    if (customerId && !applicationId) {
      const { data: linkedApp } = await supabase
        .from('service_applications')
        .select('id')
        .eq('customer_id', customerId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (linkedApp?.id) {
        applicationId = linkedApp.id
        customerId = undefined
      }
    }

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

    // 2026-10-06 재설계: normalizePaymentMethod() 로 레거시+신규 enum 모두 처리.
    //   레거시 '현금(계산서 희망)' → 'virtual_account' 로 자동 변환되어 vbank 플로우로 라우팅.
    //   2026-10-12 법인카드(corporate_card) 통합 — normalizePaymentMethod()에서 credit_card로 매핑됨.
    const rawPm = String(app.payment_method ?? '')
    const pm = normalizePaymentMethod(rawPm)
    const isCard     = pm === 'credit_card'
    const isVbank    = pm === 'virtual_account'
    const isTransfer = pm === 'bank_transfer'

    if (!isCard && !isVbank && !isTransfer) {
      return NextResponse.json(
        { error: `결제수단 '${rawPm}'은(는) 포트원 결제 대상이 아닙니다.` },
        { status: 400 },
      )
    }

    let supply  = Number(app.supply_amount ?? 0)
    let vat     = Number(app.vat ?? 0)
    let deposit = Number(app.deposit ?? 0)

    // 2026-10-23: service_applications 금액이 0 인데 customers 쪽엔 세팅돼있는 shadow mismatch 안전망.
    // 관리자가 고객 저장을 통해 PATCH /api/admin/customers 를 거치지 않은 신청서 생성 경로(예: 포클래식 사례)에서
    // service_applications.supply_amount 가 0 으로 남아 "잔금 금액이 0원입니다" 에러로 링크 발급이 실패하던 문제 해결.
    // customers 쪽에서 더 큰 값을 발견하면 fallback + service_applications 쪽도 영구 동기화해 재발 방지.
    if (!isCustomerMode && supply === 0 && app.customer_id) {
      const { data: custFallback } = await supabase
        .from('customers')
        .select('supply_amount, vat, deposit')
        .eq('id', app.customer_id as string)
        .maybeSingle()
      const fSupply = Number(custFallback?.supply_amount ?? 0)
      if (fSupply > 0) {
        supply  = fSupply
        vat     = Number(custFallback?.vat ?? 0)
        deposit = Number(custFallback?.deposit ?? deposit)
        await supabase
          .from('service_applications')
          .update({ supply_amount: supply, vat, deposit })
          .eq('id', recordId)
      }
    }

    const balance = calcBalance(supply, vat, deposit)
    const amount  = stage === 'deposit' ? deposit : balance

    if (amount <= 0) {
      return NextResponse.json({ error: `${stage === 'deposit' ? '예약금' : '잔금'} 금액이 0원입니다.` }, { status: 400 })
    }

    // 기존 링크 재사용: 이미 paymentId가 있으면 동일 URL 반환
    const existingUrlField = stage === 'deposit' ? 'deposit_payment_url' : 'balance_payment_url'
    const existingIdField  = stage === 'deposit' ? 'deposit_portone_id'   : 'balance_portone_id'
    if (app[existingIdField] && app[existingUrlField]) {
      // 2026-10-26: 재사용 시에도 연결된 고객 레코드에 동기화.
      //   신청서엔 링크가 있는데 customers 쪽이 비어 고객관리 진행흐름에 "미생성"으로 남던 문제 해결.
      if (!isCustomerMode && app.customer_id) {
        const { error: syncErr } = await supabase.from('customers').update({
          [existingIdField]: app[existingIdField],
          [existingUrlField]: app[existingUrlField],
        }).eq('id', app.customer_id as string)
        if (syncErr) console.error('[issue-payment-link] reuse customers 동기화 실패:', syncErr.message)
      }
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

      // service_applications → customers 동기화: 고객관리 UI가 customers 테이블을 직접 참조하므로
      // 신청서 모드에서 링크 생성 시 연결된 고객 레코드에도 portone_id + payment_url 동기화
      if (!isCustomerMode) {
        try {
          const { data: appLink } = await supabase
            .from('service_applications')
            .select('customer_id')
            .eq('id', recordId)
            .single()
          if (appLink?.customer_id) {
            await supabase.from('customers').update({
              [existingIdField]: paymentId,
              [existingUrlField]: paymentUrl,
            }).eq('id', appLink.customer_id)
          }
        } catch {
          // customers 동기화 실패는 조용히 무시
        }
      }

      console.log('[issue-payment-link] SUCCESS 반환:', paymentUrl)
      return NextResponse.json({ success: true, paymentUrl, paymentId })
    }

    // ─── 가상계좌: 서버사이드 직접 발급 ────────────────────────────────────
    const client    = getPortOneClient()!
    const channelKey = getChannelKey('vbank')

    // KG 이니시스 가상계좌는 customer.email이 필수 (REQUIRED 룰)
    // 형식이 틀린 이메일(예: '@' 2개)도 PortOne 이 거절하므로 대체 주소 사용 (2026-10-26)
    const emailForVbank = resolvePaymentEmail(String(app.email ?? ''), recordId)

    // 2026-10-12 UX 개편: 고객이 선택한 은행 코드 사용. 유효하지 않으면 기본값(KOOKMIN).
    const selectedBankCode = (vbankCode && isValidBBKVBankCode(vbankCode))
      ? vbankCode
      : DEFAULT_VBANK_CODE

    // 2026-10-13 race condition 수정: payInstantly 호출 전에 paymentId 를 DB 에 먼저 저장.
    //   PortOne 이 payInstantly 응답 전에 Transaction.VirtualAccountIssued webhook 을 발사하는 사례 발견 →
    //   webhook 핸들러가 deposit_portone_id 로 조회 시 "not found" 에러.
    //   paymentId 를 미리 저장하면 webhook 이 어느 시점에 도착해도 조회 성공.
    const idParamVbankPre = isCustomerMode ? `custId=${recordId}` : `appId=${recordId}`
    const paymentUrlPre = `${APP_BASE_URL}/portone/pay/${paymentId}?stage=${stage}&${idParamVbankPre}`
    const { error: prewriteError } = await supabase
      .from(table)
      .update({
        [existingIdField]: paymentId,
        [existingUrlField]: paymentUrlPre,
      })
      .eq('id', recordId)
    if (prewriteError) {
      console.error('[issue-payment-link] vbank pre-write 실패:', prewriteError.message, { recordId, paymentId })
      return NextResponse.json({ error: '결제 ID 사전 저장 실패', detail: prewriteError.message }, { status: 500 })
    }

    const vbankResult = await client.payment.payInstantly({
      paymentId,
      storeId: getStoreId(),
      channelKey,
      method: {
        virtualAccount: {
          bank: selectedBankCode as 'HANA', // server-sdk Bank enum (짧은 코드)
          expiry: { validHours: 24 * 7 },
          option: { type: 'NORMAL' },
          remitteeName: '범빌드코리아(주)',
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

    // 가상계좌 정보 추출 — PortOne V2 응답 구조가 PG별로 다를 수 있어 방어적 탐색
    // 2026-10-12 윤현식 건에서 응답 즉시엔 virtualAccount 가 null로 오는 현상 발견
    //   → 추출 실패해도 저장은 계속 (paymentId/URL만 저장) + Transaction.VirtualAccountIssued webhook 이 뒤에 채움.
    const vbankInfo = (vbankResult as Record<string, unknown>)
    const vbankMethod = (vbankInfo.method as Record<string, unknown>) ?? {}
    const vbankObj    = (vbankInfo.virtualAccount as Record<string, unknown>)
                       ?? (vbankMethod.virtualAccount as Record<string, unknown>)
                       ?? {}
    const accountNumber  = String(vbankObj.accountNumber ?? vbankMethod.accountNumber ?? '')
    const bankName       = String(vbankObj.bankName ?? vbankObj.bank ?? vbankMethod.bank ?? '')
    const expiredAtRaw   = vbankObj.accountExpiry ?? vbankObj.expiredAt ?? vbankMethod.accountExpiry
    const expiredAt      = expiredAtRaw ? new Date(String(expiredAtRaw)).toISOString() : null

    // 즉시 응답에서 가상계좌 정보 못 받으면 로깅 (webhook이 뒤에 채우도록 fallback)
    if (!accountNumber && !isCustomerMode) {
      console.warn('[issue-payment-link] vbank 즉시 응답에서 계좌번호 추출 실패 — webhook fallback 대기', {
        paymentId,
        responseKeys: Object.keys(vbankInfo),
        methodKeys: Object.keys(vbankMethod),
      })
    }

    const idParamVbank = isCustomerMode ? `custId=${recordId}` : `appId=${recordId}`
    const paymentUrl = `${APP_BASE_URL}/portone/pay/${paymentId}?stage=${stage}&${idParamVbank}`

    // 가상계좌 정보는 신청서(service_applications)에만 필드가 존재 — customer 모드는 스킵
    // 계좌번호 추출 실패 시 virtual_account_* 필드는 빼고 UPDATE (webhook이 뒤에 채움)
    const vbankUpdates: Record<string, unknown> = isCustomerMode
      ? { [existingIdField]: paymentId, [existingUrlField]: paymentUrl }
      : {
          [existingIdField]: paymentId,
          [existingUrlField]: paymentUrl,
          ...(accountNumber ? { virtual_account_number: accountNumber } : {}),
          ...(bankName      ? { virtual_account_bank: bankName }        : {}),
          ...(expiredAt     ? { virtual_account_expired_at: expiredAt } : {}),
        }

    const { error: vbankUpdateError } = await supabase
      .from(table)
      .update(vbankUpdates)
      .eq('id', recordId)

    if (vbankUpdateError) {
      console.error('[issue-payment-link] vbank DB UPDATE 실패:', vbankUpdateError.message, { recordId, paymentId })
      return NextResponse.json({ error: '가상계좌 발급 후 DB 저장 실패', detail: vbankUpdateError.message }, { status: 500 })
    }

    // service_applications → customers 동기화 (가상계좌 분기)
    if (!isCustomerMode) {
      try {
        const { data: appLink } = await supabase
          .from('service_applications')
          .select('customer_id')
          .eq('id', recordId)
          .single()
        if (appLink?.customer_id) {
          await supabase.from('customers').update({
            [existingIdField]: paymentId,
            [existingUrlField]: paymentUrl,
          }).eq('id', appLink.customer_id)
        }
      } catch {
        // customers 동기화 실패는 조용히 무시
      }
    }

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
