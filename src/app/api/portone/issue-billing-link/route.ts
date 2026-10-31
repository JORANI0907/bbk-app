/**
 * 정기 결제 링크 발급 API
 *
 * POST /api/portone/issue-billing-link  body: { billingId }
 * 실제 로직은 src/lib/billing-link.ts 의 issueBillingLink() — 서버 내부 코드는 lib 를 직접 호출한다.
 * 이 라우트는 관리자 UI(결제 링크 수동 발급 버튼)용 얇은 껍데기.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { issueBillingLink } from '@/lib/billing-link'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { billingId?: string }
    if (!body.billingId) {
      return NextResponse.json({ error: 'billingId 가 필요합니다' }, { status: 400 })
    }
    const result = await issueBillingLink(createServiceClient(), body.billingId)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ ok: true, paymentId: result.paymentId, paymentUrl: result.paymentUrl, reused: result.reused })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
