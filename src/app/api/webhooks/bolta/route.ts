import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyBoltaWebhook, parseBoltaWebhookEvent, type BoltaWebhookEvent } from '@/lib/bolta/webhook'
import { markInvoicesIssued, type MarkItem } from '@/lib/tax-invoice-mark-issued'
import { sendSlack } from '@/lib/slack'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// 볼타 웹훅 수신: 세금계산서 발행 성공/실패
//
//  1. 서명 검증 (Standard Webhooks) → 실패 401
//  2. tax_invoice_events 에 webhook-id 로 기록. 이미 있고 processed_at 이 찍혀 있으면 200 (중복),
//     있지만 처리 전이면 이어서 처리 (이전 시도가 중간에 실패한 경우)
//  3. issuanceKey 로 초안 찾기. 없으면 500 → 볼타가 재전송 (발행 응답보다 웹훅이 먼저 온 경우 대비)
//  4. 성공: 초안 issued → 원본(청구서/신청서)이 아직 미발행이면 발행완료 처리(상태·고객 알림)
//     실패: 초안 failed (이미 issued 면 건너뜀) + Slack
//  5. 모두 끝나면 processed_at 기록, 200

type ServiceClient = ReturnType<typeof createServiceClient>

interface DraftRow {
  id: string
  source: 'application' | 'billing' | 'customer'
  source_id: string
  supplier_id: string | null
  issue_status: string
  receiver_business_name: string | null
}

async function recordEvent(
  supabase: ServiceClient,
  webhookId: string,
  event: BoltaWebhookEvent,
  rawBody: string,
): Promise<'new' | 'retry' | 'done'> {
  const { error } = await supabase.from('tax_invoice_events').insert({
    webhook_id: webhookId,
    event_type: event.eventType,
    issuance_key: event.data.issuanceKey,
    payload: JSON.parse(rawBody),
  })
  if (!error) return 'new'
  if (error.code !== '23505') throw new Error(`이벤트 기록 실패: ${error.message}`)
  const { data } = await supabase
    .from('tax_invoice_events')
    .select('processed_at')
    .eq('webhook_id', webhookId)
    .maybeSingle()
  return data?.processed_at ? 'done' : 'retry'
}

async function markProcessed(supabase: ServiceClient, webhookId: string, draftId: string | null) {
  await supabase
    .from('tax_invoice_events')
    .update({ processed_at: new Date().toISOString(), draft_id: draftId })
    .eq('webhook_id', webhookId)
}

async function findDraft(supabase: ServiceClient, issuanceKey: string): Promise<DraftRow | null> {
  const { data } = await supabase
    .from('tax_invoice_drafts')
    .select('id, source, source_id, supplier_id, issue_status, receiver_business_name')
    .eq('bolta_issuance_key', issuanceKey)
    .maybeSingle()
  return (data as DraftRow | null) ?? null
}

/** 원본이 이미 발행완료면 null (알림 중복 방지). 아니면 markInvoicesIssued 입력 */
async function toPendingMarkItem(supabase: ServiceClient, draft: DraftRow): Promise<MarkItem | null | 'already'> {
  if (draft.source === 'application') {
    const { data } = await supabase
      .from('service_applications')
      .select('tax_invoice_issued')
      .eq('id', draft.source_id)
      .maybeSingle()
    if (data?.tax_invoice_issued) return 'already'
    return { source: 'application', source_id: draft.source_id }
  }
  if (draft.source !== 'billing') return null
  const { data } = await supabase
    .from('service_billings')
    .select('customer_id, tax_invoice_issued')
    .eq('id', draft.source_id)
    .maybeSingle()
  if (!data?.customer_id) return null
  if (data.tax_invoice_issued) return 'already'
  return { source: 'customer', source_id: data.customer_id as string, billing_ids: [draft.source_id] }
}

async function handleSuccess(supabase: ServiceClient, draft: DraftRow, taxInvoiceUrl: string | null) {
  if (draft.issue_status !== 'issued') {
    const { error } = await supabase
      .from('tax_invoice_drafts')
      .update({ issue_status: 'issued', issued_at: new Date().toISOString(), tax_invoice_url: taxInvoiceUrl, failure_code: null, failure_message: null })
      .eq('id', draft.id)
    if (error) throw new Error(`발행 상태 저장 실패: ${error.message}`)
  }

  const item = await toPendingMarkItem(supabase, draft)
  if (item === 'already') return
  if (!item) {
    await sendSlack(`⚠️ 세금계산서 발행완료 처리 불가 — 초안 ${draft.id} (${draft.receiver_business_name ?? ''}) 의 고객을 찾지 못함`)
    return
  }
  const result = await markInvoicesIssued(supabase, [item], {
    issuedBy: 'bolta-webhook',
    supplierId: draft.supplier_id,
    fileUrl: taxInvoiceUrl ?? undefined,
    source: 'webhooks/bolta',
  })
  const notice = result.failedNotifications > 0 ? ' · 고객 알림 실패' : ''
  await sendSlack(`🧾 세금계산서 발행완료 (볼타) — ${draft.receiver_business_name ?? ''}${notice}`)
}

async function handleFailure(supabase: ServiceClient, draft: DraftRow, code: string, message: string) {
  if (draft.issue_status === 'issued') return
  await supabase
    .from('tax_invoice_drafts')
    .update({ issue_status: 'failed', failure_code: code, failure_message: message })
    .eq('id', draft.id)
    .neq('issue_status', 'issued')
  await sendSlack(`❌ 세금계산서 발행 실패 (볼타) — ${draft.receiver_business_name ?? ''} · ${code}: ${message}`)
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const webhookId = request.headers.get('webhook-id')
  const verify = verifyBoltaWebhook(
    { id: webhookId, timestamp: request.headers.get('webhook-timestamp'), signature: request.headers.get('webhook-signature') },
    rawBody,
    process.env.BOLTA_WEBHOOK_SECRET,
  )
  if (!verify.ok || !webhookId) {
    const status = verify.ok === false && verify.reason === 'no_secret' ? 503 : 401
    return NextResponse.json({ error: `webhook rejected: ${verify.ok ? 'missing_header' : verify.reason}` }, { status })
  }

  const event = parseBoltaWebhookEvent(rawBody)
  // 모르는 이벤트는 받았다고만 응답 (재시도 방지)
  if (!event) return NextResponse.json({ ok: true, ignored: true })

  const supabase = createServiceClient()
  try {
    const recorded = await recordEvent(supabase, webhookId, event, rawBody)
    if (recorded === 'done') return NextResponse.json({ ok: true, duplicate: true })

    const draft = await findDraft(supabase, event.data.issuanceKey)
    if (!draft) {
      // 발행 API 응답(키 저장)보다 웹훅이 먼저 온 경우. 500 으로 재전송을 유도한다 (볼타 최대 8회)
      await sendSlack(`⚠️ 볼타 웹훅 매칭 실패 (재전송 대기) — issuanceKey ${event.data.issuanceKey}`)
      return NextResponse.json({ error: 'draft not found yet' }, { status: 500 })
    }

    if (event.eventType === 'TAX_INVOICE_ISSUANCE_SUCCESS') {
      await handleSuccess(supabase, draft, event.data.taxInvoiceUrl ?? null)
    } else {
      await handleFailure(supabase, draft, event.data.cause?.code ?? 'UNKNOWN', event.data.cause?.message ?? '사유 없음')
    }
    await markProcessed(supabase, webhookId, draft.id)
    return NextResponse.json({ ok: true, retried: recorded === 'retry' })
  } catch (e) {
    console.error('[webhooks/bolta]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : '처리 실패' }, { status: 500 })
  }
}
