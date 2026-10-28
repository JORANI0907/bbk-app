/**
 * 정기 결제 안내 SMS — 고객관리 정기 플로우의 [💰 결제 안내] 버튼 전용 (2026-10-29)
 *
 * POST { billing_id, dry_run? }
 *   dry_run=true  → 실제 템플릿으로 렌더한 미리보기 텍스트만 반환 (발송 안 함)
 *   dry_run=false → 문자알림관리 '정기결제알림' 템플릿으로 발송 + 이력 기록
 *
 * 템플릿 선택·변수는 자동 발송 cron(reservation-reminders)과 같은
 * lib/recurring-billing-notice 를 사용 → 미리보기 = 자동 발송 내용.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendByTemplate } from '@/lib/template-sender'
import { renderTemplate } from '@/lib/notification-renderer'
import { saveNotificationHistory } from '@/lib/notification'
import {
  pickRecurringBillingTemplate,
  buildRecurringBillingContext,
  type RecurringBillingCustomer,
} from '@/lib/recurring-billing-notice'

type Supabase = ReturnType<typeof createServiceClient>

interface BillingWithCustomer {
  id: string
  billing_period: string
  amount: number | null
  due_date: string | null
  payment_url: string | null
  customers: (RecurringBillingCustomer & { id: string }) | null
}

async function loadBilling(supabase: Supabase, billingId: string): Promise<BillingWithCustomer | null> {
  const { data } = await supabase
    .from('service_billings')
    .select(`
      id, billing_period, amount, due_date, payment_url,
      customers(id, business_name, contact_name, contact_phone, customer_type, payment_method, account_number)
    `)
    .eq('id', billingId)
    .maybeSingle()
  return (data as unknown as BillingWithCustomer | null) ?? null
}

async function renderPreview(supabase: Supabase, templateCode: string, billing: BillingWithCustomer) {
  const { data: tpl } = await supabase
    .from('notification_templates')
    .select('body, is_active')
    .eq('code', templateCode)
    .maybeSingle()
  if (!tpl || !tpl.is_active) return null
  return renderTemplate(String(tpl.body), buildRecurringBillingContext(billing.customers!, billing))
}

/** 고객관리 알림이력(customers.notification_log) 맨 앞에 추가 + 청구 last_notified_at 갱신 */
async function recordSent(supabase: Supabase, billing: BillingWithCustomer, phone: string, channel: string) {
  const nowKSTIso = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('Z', '+09:00')
  const entry = {
    type: '정기결제알림', sent_at: nowKSTIso, phone, method: 'manual', channel,
    billing_id: billing.id, billing_period: billing.billing_period,
  }
  const custId = billing.customers!.id
  const { data: custRow } = await supabase.from('customers').select('notification_log').eq('id', custId).single()
  const existLog = Array.isArray(custRow?.notification_log) ? custRow.notification_log as object[] : []
  await supabase.from('customers').update({ notification_log: [entry, ...existLog] }).eq('id', custId)
  await supabase.from('service_billings').update({ last_notified_at: nowKSTIso }).eq('id', billing.id)
}

export async function POST(request: NextRequest) {
  try {
    const { billing_id, dry_run } = await request.json() as { billing_id?: string; dry_run?: boolean }
    if (!billing_id) return NextResponse.json({ error: 'billing_id가 필요합니다.' }, { status: 400 })

    const supabase = createServiceClient()
    const billing = await loadBilling(supabase, billing_id)
    if (!billing?.customers) return NextResponse.json({ error: '결제 레코드를 찾을 수 없습니다.' }, { status: 404 })

    const cust = billing.customers
    const templateCode = pickRecurringBillingTemplate(cust.customer_type, cust.payment_method)

    if (dry_run) {
      const text = await renderPreview(supabase, templateCode, billing)
      if (text === null) return NextResponse.json({ error: `템플릿이 없거나 꺼져 있어요: ${templateCode}` }, { status: 400 })
      return NextResponse.json({ templateCode, text })
    }

    const phone = String(cust.contact_phone ?? '').replace(/-/g, '')
    if (!phone) return NextResponse.json({ error: '고객 연락처가 없습니다.' }, { status: 400 })

    const result = await sendByTemplate(templateCode, phone, buildRecurringBillingContext(cust, billing))
    if (!result.ok) {
      return NextResponse.json({ error: `발송 실패 (${result.reason}${result.details ? `: ${result.details}` : ''})` }, { status: 500 })
    }

    await recordSent(supabase, billing, phone, result.type)
    await saveNotificationHistory({
      category: 'sms', type: '정기결제알림', body: result.text, method: 'manual',
      recipientType: 'customer', recipientPhone: phone,
      metadata: { billing_id: billing.id, customer_id: cust.id, billing_period: billing.billing_period,
        channel: result.type, source: 'admin/billings/notify' },
      status: 'sent',
    })
    return NextResponse.json({ ok: true, templateCode, channel: result.type })
  } catch (e) {
    console.error('[billings/notify] 실패:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: '결제 안내 발송 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
