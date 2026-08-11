import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  getPortOneClient,
  getStoreId,
  generatePaymentId,
  isPortOneEnabled,
} from '@/lib/portone'

/**
 * KG이니시스 심사원 전용 격리 API.
 * 심사원이 /kg-review 신청서 작성 → 이 API 호출 → service_applications insert +
 * PortOne 카드 결제 링크 발급 → 결제 URL 반환 → 프론트가 그 URL로 이동.
 *
 * 격리 원칙:
 *   - middleware public path 에 등록되어 세션 없이 접근
 *   - 기존 issue-payment-link 로직은 건드리지 않음
 *   - 기존 알림 로직(complete/webhook/auto-send)에도 관여하지 않음
 *   - insert 레코드는 source='kg-review' 라벨 → 심사 완료 후 필터 삭제 용이
 *   - 카드 결제만 지원 (심사에 필요한 최소 흐름)
 *
 * 심사 완료 후: 이 파일 삭제 + middleware public path 제거 + 재배포.
 */
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.bbkorea.co.kr'

export async function POST(request: NextRequest) {
  try {
    if (!isPortOneEnabled()) {
      return NextResponse.json({ error: '포트원 미설정' }, { status: 503 })
    }

    const body = await request.json() as {
      businessName?: string
      ownerName?: string
      phone?: string
      email?: string
      serviceType?: string
      amount?: number
    }

    const businessName = String(body.businessName ?? '').trim()
    const ownerName    = String(body.ownerName ?? '').trim()
    const phone        = String(body.phone ?? '').replace(/-/g, '')
    const email        = String(body.email ?? '').trim()
    const serviceType  = String(body.serviceType ?? '1회성케어')
    const amount       = Number(body.amount ?? 88000)

    if (!businessName || !ownerName || !phone || !email) {
      return NextResponse.json({ error: '상호명·담당자명·연락처·이메일은 필수입니다.' }, { status: 400 })
    }
    if (amount < 1000) {
      return NextResponse.json({ error: '결제금액이 너무 낮습니다. (최소 1,000원)' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // 1) 심사용 신청서 insert.
    //    source='kg-review' 라벨로 심사 완료 후 필터 삭제 가능하게 함.
    //    supply/vat/deposit 을 총액 기준으로 세팅. deposit=총액 이므로 한 번의 결제로 완결.
    const supplyAmount = Math.round(amount / 1.1)
    const vatAmount    = amount - supplyAmount

    const { data: inserted, error: insertError } = await supabase
      .from('service_applications')
      .insert({
        business_name:    businessName,
        owner_name:       ownerName,
        phone,
        email,
        address:          '심사용 (KG이니시스 review)',
        service_type:     serviceType,
        payment_method:   '카드(온라인 간편결제)',
        supply_amount:    supplyAmount,
        vat:              vatAmount,
        deposit:          amount,
        construction_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        source:           'kg-review',
      })
      .select('id')
      .single()

    if (insertError || !inserted) {
      return NextResponse.json(
        { error: `신청서 저장 실패: ${insertError?.message ?? 'unknown'}` },
        { status: 500 },
      )
    }

    const applicationId = inserted.id as string

    // 2) PortOne 사전등록. 카드 결제 브라우저 SDK 로 결제 페이지에서 requestPayment 호출.
    const paymentId = generatePaymentId(applicationId, 'deposit')
    const client    = getPortOneClient()!
    await client.payment.preRegisterPayment({
      paymentId,
      storeId: getStoreId(),
      totalAmount: amount,
      currency: 'KRW',
    })

    const paymentUrl = `${APP_BASE_URL}/portone/pay/${paymentId}?stage=deposit&appId=${applicationId}`

    // 3) 발급된 결제 정보를 신청서에 반영.
    await supabase
      .from('service_applications')
      .update({
        deposit_portone_id:  paymentId,
        deposit_payment_url: paymentUrl,
      })
      .eq('id', applicationId)

    return NextResponse.json({
      success: true,
      applicationId,
      paymentUrl,
      paymentId,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
