/**
 * 정기 결제 링크 자동 생성 API (2026-10-18 Phase H.1)
 *
 * 설계 범위:
 *   service_billings 1건 → paymentId 발급 + URL 생성 + DB 저장.
 *   완전 PortOne payInstantly 자동 결제는 다음 세션 (결제 페이지 신규 필요).
 *   지금은 BBK 결제 페이지 URL 포맷만 생성 — 사장님이 수동 입력 필드로 fallback 가능.
 *
 * 입력:
 *   POST /api/portone/issue-billing-link
 *   body: { billingId: string }
 *
 * 출력:
 *   { paymentUrl: string, paymentId: string }
 *   or { error: string } (4xx/5xx)
 *
 * 저장:
 *   service_billings.payment_portone_id   = 생성된 paymentId
 *   service_billings.payment_url          = 결제 안내 페이지 URL
 *   service_billings.payment_method_snapshot = 거래처 결제방식 snapshot
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.bbkorea.co.kr'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { billingId?: string }
    const billingId = body.billingId
    if (!billingId) {
      return NextResponse.json({ error: 'billingId 가 필요합니다' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // 1) service_billings 조회
    const { data: billing, error: fetchErr } = await supabase
      .from('service_billings')
      .select('id, customer_id, amount, billing_type, billing_period, status, payment_url, payment_portone_id')
      .eq('id', billingId)
      .maybeSingle()

    if (fetchErr || !billing) {
      return NextResponse.json(
        { error: fetchErr?.message ?? '결제 레코드를 찾을 수 없습니다' },
        { status: 404 },
      )
    }

    if (billing.status === 'paid') {
      return NextResponse.json({ error: '이미 결제 완료된 건입니다' }, { status: 409 })
    }

    // 2) 거래처 조회 (결제방식 snapshot 용)
    let paymentMethodSnapshot: string | null = null
    if (billing.customer_id) {
      const { data: cust } = await supabase
        .from('customers')
        .select('payment_method')
        .eq('id', billing.customer_id)
        .maybeSingle()
      paymentMethodSnapshot = (cust?.payment_method as string | null) ?? null
    }

    // 3) paymentId 생성 (BBK 자체 포맷 — webhook 매칭용)
    //    기존 1회성 패턴: bbk_{short}_{timestamp}
    //    정기용: bbk_billing_{billingId앞8자}_{timestamp}
    const shortId = billing.id.replace(/-/g, '').slice(0, 8)
    const paymentId = `bbk_billing_${shortId}_${Date.now()}`

    // 4) 결제 안내 페이지 URL (BBK 자체 호스팅)
    //    실제 결제 페이지 UI 는 다음 세션 (/app/portone/billing-pay/[billingId]/page.tsx 신규)
    //    당분간은 가상계좌 안내용 placeholder URL. 사장님이 수동 입력 필드로 PortOne 실제 URL 교체 가능.
    const paymentUrl = `${APP_BASE_URL}/portone/billing-pay/${billing.id}?pid=${paymentId}`

    // 5) service_billings 업데이트 (payment_portone_id 미리 저장 — webhook race condition 방지)
    const { error: updateErr } = await supabase
      .from('service_billings')
      .update({
        payment_portone_id: paymentId,
        payment_url: paymentUrl,
        payment_method_snapshot: paymentMethodSnapshot,
      })
      .eq('id', billing.id)

    if (updateErr) {
      return NextResponse.json(
        { error: `DB 저장 실패: ${updateErr.message}` },
        { status: 500 },
      )
    }

    return NextResponse.json({
      ok: true,
      paymentId,
      paymentUrl,
      note: '현재 URL 은 포맷만 생성됨. 결제 페이지 UI 구현은 다음 Phase. 당분간 PortOne 수동 발급 링크를 수동 입력으로 교체 가능.',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
