/**
 * 정기 결제 안내 SMS — 고객관리 정기 플로우의 [💰 결제 안내] 버튼 전용 (2026-10-29)
 *
 * POST { billing_id, dry_run? }
 *   dry_run=true  → 실제 템플릿으로 렌더한 미리보기 텍스트만 반환 (발송 안 함)
 *   dry_run=false → 문자알림관리 '정기결제알림' 템플릿으로 발송 + 이력 기록
 *
 * 2026-11-01: 발송 본체는 자동 cron(billing-notify)·작업완료 즉시 발송과 같은
 *   lib/recurring-billing-notice.sendRecurringBillingNotice 를 사용 → 미리보기 = 실제 발송 내용.
 *   수동 발송은 빌링키 자동결제를 시도하지 않는다 (사장님이 문자를 보내려고 누른 버튼이므로).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { renderTemplate } from '@/lib/notification-renderer'
import { issueBillingLink } from '@/lib/billing-link'
import {
  pickRecurringBillingTemplate,
  buildRecurringBillingContext,
  loadBillingForNotice,
  sendRecurringBillingNotice,
} from '@/lib/recurring-billing-notice'

type Supabase = ReturnType<typeof createServiceClient>

async function renderPreview(supabase: Supabase, billingId: string): Promise<{ templateCode: string; text: string } | { error: string }> {
  const b = await loadBillingForNotice(supabase, billingId)
  if (!b) return { error: '결제 레코드를 찾을 수 없습니다.' }

  // 미리보기에도 실제 링크가 보이도록 없으면 발급
  let paymentUrl = b.payment_url
  if (!paymentUrl) {
    const link = await issueBillingLink(supabase, b.id)
    if (link.ok) paymentUrl = link.paymentUrl
  }

  const templateCode = pickRecurringBillingTemplate(b.customer.customer_type, b.customer.payment_method)
  const { data: tpl } = await supabase
    .from('notification_templates')
    .select('body, is_active')
    .eq('code', templateCode)
    .maybeSingle()
  if (!tpl || !tpl.is_active) return { error: `템플릿이 없거나 꺼져 있어요: ${templateCode}` }

  const ctx = buildRecurringBillingContext(b.customer, { amount: b.amount, due_date: b.due_date, payment_url: paymentUrl })
  return { templateCode, text: renderTemplate(String(tpl.body), ctx) }
}

export async function POST(request: NextRequest) {
  try {
    const { billing_id, dry_run } = await request.json() as { billing_id?: string; dry_run?: boolean }
    if (!billing_id) return NextResponse.json({ error: 'billing_id가 필요합니다.' }, { status: 400 })

    const supabase = createServiceClient()

    if (dry_run) {
      const preview = await renderPreview(supabase, billing_id)
      if ('error' in preview) return NextResponse.json({ error: preview.error }, { status: 400 })
      return NextResponse.json(preview)
    }

    const r = await sendRecurringBillingNotice(supabase, billing_id, {
      method: 'manual', source: 'admin/billings/notify', tryAutoCharge: false,
    })
    if (!r.ok) {
      const status = r.reason === 'not_found' ? 404 : r.reason === 'send_failed' ? 500 : 400
      return NextResponse.json({ error: `발송 실패: ${r.message}` }, { status })
    }
    if (r.kind === 'auto_charged') {
      return NextResponse.json({ ok: true, autoCharged: true, paymentId: r.paymentId })
    }
    return NextResponse.json({ ok: true, templateCode: r.templateCode, channel: r.channel, attempt: r.attemptNo })
  } catch (e) {
    console.error('[billings/notify] 실패:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: '결제 안내 발송 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
