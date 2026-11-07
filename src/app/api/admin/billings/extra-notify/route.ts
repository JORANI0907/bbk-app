/**
 * POST /api/admin/billings/extra-notify — 1회성 추가 결제 안내 문자 (수동 재발송)
 *   body: { billing_id }
 *   청구서 생성 때는 /api/admin/billings POST 가 자동으로 보내고, 이 라우트는 고객관리의
 *   "문자 다시 보내기" 버튼용. 발송 본체는 lib/extra-billing-notice.ts.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { sendExtraBillingNotice } from '@/lib/extra-billing-notice'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = getServerSession()
    if (!session || session.role === 'customer') {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 401 })
    }
    const { billing_id } = await request.json() as { billing_id?: string }
    if (!billing_id) return NextResponse.json({ error: 'billing_id가 필요합니다.' }, { status: 400 })

    const supabase = createServiceClient()
    const r = await sendExtraBillingNotice(supabase, billing_id, { method: 'manual', source: 'admin/billings/extra-notify' })
    if (!r.ok) {
      const status = r.reason === 'not_found' ? 404 : r.reason === 'send_failed' ? 500 : 400
      return NextResponse.json({ error: `발송 실패: ${r.message}` }, { status })
    }
    return NextResponse.json({ ok: true, templateCode: r.templateCode, channel: r.channel, attempt: r.attemptNo, paymentUrl: r.paymentUrl })
  } catch (e) {
    console.error('[billings/extra-notify] 실패:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: '추가 결제 안내 발송 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
