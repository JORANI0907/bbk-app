import { NextRequest, NextResponse } from 'next/server'
import { getPortOneClient, getStoreId, isPortOneEnabled } from '@/lib/portone'
import { requireAuditSession } from '@/lib/kg-audit/session'
import { findProduct, calcTotalAmount, isSubscriptionCode } from '@/lib/kg-audit/products'

/**
 * KG 심사 전용 결제 진입.
 *
 * 흐름:
 *   1. 심사관 세션 확인
 *   2. 상품 코드 배열 → 서버에서 검증 및 금액 확정 (클라이언트 위변조 방지)
 *   3. 정기 상품이면 billing 흐름, 1회성이면 일반 결제 흐름
 *   4. paymentId 사전등록 후 결제 페이지 URL 반환
 *
 * 격리 원칙:
 *   - service_applications 에 source='kg-audit' 로 라벨
 *   - 심사 완료 후 필터 삭제 가능
 *   - 기존 /portone/pay 페이지는 건드리지 않음 (kg-audit 전용 pay 페이지 사용)
 */
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.bbkorea.co.kr'

export async function POST(request: NextRequest) {
  try {
    // 1) 심사관 세션 확인
    const isAuthed = await requireAuditSession()
    if (!isAuthed) {
      return NextResponse.json({ error: '심사원 세션이 필요합니다.' }, { status: 401 })
    }

    if (!isPortOneEnabled()) {
      return NextResponse.json({ error: '포트원이 설정되지 않았습니다.' }, { status: 503 })
    }

    const body = await request.json() as { codes?: string[] }
    const codes = Array.isArray(body.codes) ? body.codes : []

    if (codes.length === 0) {
      return NextResponse.json({ error: '상품을 하나 이상 선택해주세요.' }, { status: 400 })
    }

    // 2) 상품 코드 검증
    for (const code of codes) {
      if (!findProduct(code)) {
        return NextResponse.json({ error: `유효하지 않은 상품 코드: ${code}` }, { status: 400 })
      }
    }

    // 정기/일반 판별: 정기 상품은 한 번에 하나만 선택 가능
    const hasSubscription = codes.some(isSubscriptionCode)
    const hasOneTime      = codes.some((c) => !isSubscriptionCode(c))

    if (hasSubscription && hasOneTime) {
      return NextResponse.json({ error: '정기 상품과 1회성 상품은 함께 결제할 수 없습니다.' }, { status: 400 })
    }
    if (hasSubscription && codes.length > 1) {
      return NextResponse.json({ error: '정기 상품은 한 번에 하나만 결제할 수 있습니다.' }, { status: 400 })
    }

    const paymentMode: 'billing' | 'card' = hasSubscription ? 'billing' : 'card'
    const totalAmount = calcTotalAmount(codes)

    // 3) paymentId 생성 (kg-audit prefix 로 명확 구분)
    const ts        = Math.floor(Date.now() / 1000)
    const paymentId = `kgaudit_${paymentMode}_${ts}_${Math.random().toString(36).slice(2, 8)}`

    // 4) 포트원 사전등록
    //    빌링(정기)은 amount 없이 issueBillingKey, 일반은 preRegisterPayment.
    //    심사관 편의를 위해 두 흐름 모두 결제 페이지에서 SDK 호출로 처리.
    if (paymentMode === 'card') {
      const client = getPortOneClient()!
      await client.payment.preRegisterPayment({
        paymentId,
        storeId:     getStoreId(),
        totalAmount,
        currency:    'KRW',
      })
    }
    // billing 모드는 preRegister 불필요 (issueBillingKey 는 클라이언트에서 직접 호출)

    const paymentUrl = `${APP_BASE_URL}/kg-audit/pay/${paymentId}?codes=${encodeURIComponent(codes.join(','))}`

    return NextResponse.json({
      success:     true,
      paymentId,
      paymentMode,
      totalAmount,
      paymentUrl,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
