/**
 * 빌링키(자동결제 카드) 저장 API (2026-10-18 Phase I.2 → 2026-11-01 보강)
 *
 * 역할:
 *   고객이 PortOne UI 에서 카드 등록 완료 후, 클라이언트가 응답으로 받은 billingKey 를
 *   서버로 전송 → customers 테이블에 저장 + 상태 'active' 전환.
 *   billingId 가 있으면 등록 직후 그 청구서를 바로 결제한다 (결제 페이지 '카드 자동결제 등록' 흐름).
 *
 * 보안 (2026-11-01):
 *   - PortOne 서버에 getBillingKey 재조회로 검증 (위조 방지)
 *   - PortOne 이 돌려준 발급 정보의 customer.id 가 요청 customerId 와 같아야 함
 *     (카드 등록창을 열 때 customer.customerId 로 우리 고객 ID 를 넘기므로, 남의 고객 ID 로 끼워 넣기 불가)
 *   - billingId 는 그 고객의 청구서여야 함 (남의 청구서를 내 카드로/내 청구서를 남의 카드로 결제 불가)
 *   - 이미 active 카드가 있으면 덮어쓰기 거부 (해제는 관리자 화면에서)
 *
 * 입력:
 *   POST /api/portone/billing-key-save
 *   body: { customerId: string, billingKey: string, issueId?: string, billingId?: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { chargeBillingWithKey } from '@/lib/billing-charge'
import { sendSlack } from '@/lib/slack'
import { triggerLabel, type BillingTrigger } from '@/lib/billing-notify-policy'

const PORTONE_V2_API_SECRET = process.env.PORTONE_V2_API_SECRET ?? ''
const PORTONE_API_BASE = 'https://api.portone.io'
const REGULAR_TYPES = new Set(['정기딥케어', '정기엔드케어'])

interface PortOneBillingKeyInfo {
  billingKey?: string
  status?: string
  issueId?: string
  customer?: { id?: string }
  methods?: Array<{
    type?: string
    card?: { issuer?: string; publisher?: string; brand?: string; name?: string; number?: string }
  }>
}

async function fetchBillingKeyFromPortOne(billingKey: string): Promise<PortOneBillingKeyInfo | null> {
  if (!PORTONE_V2_API_SECRET) return null
  try {
    const res = await fetch(`${PORTONE_API_BASE}/billing-keys/${encodeURIComponent(billingKey)}`, {
      method: 'GET',
      headers: { Authorization: `PortOne ${PORTONE_V2_API_SECRET}`, 'Content-Type': 'application/json' },
    })
    if (!res.ok) return null
    return await res.json() as PortOneBillingKeyInfo
  } catch {
    return null
  }
}

function extractCardName(info: PortOneBillingKeyInfo | null): string | null {
  if (!info?.methods?.length) return null
  const cardMethod = info.methods.find(m => m.type === 'BillingKeyPaymentMethodCard' || m.card)
  const card = cardMethod?.card
  if (!card) return null
  const issuer = card.name || card.publisher || card.issuer || '카드'
  const last4 = card.number ? card.number.replace(/[^0-9*]/g, '').slice(-4) : ''
  return last4 ? `${issuer} ${last4}` : issuer
}

type Supabase = ReturnType<typeof createServiceClient>

interface CustRow {
  id: string
  business_name: string | null
  customer_type: string | null
  billing_key_status: string | null
  billing_trigger: string | null
  payment_date: number | null
  notification_log: unknown
}

/** 요청의 customerId·billingId 가 서로, 그리고 PortOne 발급 정보와 맞는지 확인 */
async function validateOwnership(
  supabase: Supabase,
  customerId: string,
  billingId: string | undefined,
  info: PortOneBillingKeyInfo,
): Promise<{ ok: true; cust: CustRow } | { ok: false; status: number; error: string }> {
  const { data: custRaw } = await supabase
    .from('customers')
    .select('id, business_name, customer_type, billing_key_status, billing_trigger, payment_date, notification_log')
    .eq('id', customerId)
    .is('deleted_at', null)
    .maybeSingle()
  const cust = custRaw as CustRow | null
  if (!cust) return { ok: false, status: 404, error: '고객을 찾을 수 없습니다.' }
  if (!REGULAR_TYPES.has(String(cust.customer_type ?? ''))) {
    return { ok: false, status: 400, error: '정기딥케어·정기엔드케어 고객만 자동결제 카드 등록이 가능합니다.' }
  }
  if (cust.billing_key_status === 'active') {
    return { ok: false, status: 409, error: '이미 자동결제 카드가 등록되어 있습니다. 변경은 고객센터로 문의해 주세요.' }
  }
  if (info.customer?.id && info.customer.id !== customerId) {
    return { ok: false, status: 403, error: '카드 등록 정보가 이 고객의 것이 아닙니다.' }
  }
  if (billingId) {
    const { data: billing } = await supabase
      .from('service_billings')
      .select('id, customer_id')
      .eq('id', billingId)
      .maybeSingle()
    if (!billing || billing.customer_id !== customerId) {
      return { ok: false, status: 403, error: '청구서가 이 고객의 것이 아닙니다.' }
    }
  }
  return { ok: true, cust }
}

/** 다음 결제 시점 한글 설명 (Slack·이력용) */
function nextChargeLabel(cust: CustRow): string {
  if (cust.billing_trigger === 'per_visit') return '시공 건 작업완료 시 자동결제'
  return `${triggerLabel((cust.billing_trigger as BillingTrigger | null) ?? null, cust.payment_date)} 자동결제`
}

/** 2026-11-01: 등록 사실을 관리자(Slack)와 고객관리 알림 이력에 남긴다 */
async function recordRegistration(
  supabase: Supabase,
  cust: CustRow,
  cardName: string | null,
  charge: { attempted: boolean; ok: boolean; message?: string; amount?: number },
): Promise<void> {
  const nowIso = new Date().toISOString()
  const existing = Array.isArray(cust.notification_log) ? (cust.notification_log as object[]) : []
  const entry = {
    type: '자동결제 카드 등록', sent_at: nowIso, phone: '', method: 'auto', channel: 'system',
    card_name: cardName, next_charge: nextChargeLabel(cust),
  }
  await supabase.from('customers').update({ notification_log: [entry, ...existing] }).eq('id', cust.id)

  const chargeLine = !charge.attempted
    ? '이번 결제: 없음 (등록만)'
    : charge.ok
      ? `이번 결제: ${Number(charge.amount ?? 0).toLocaleString('ko-KR')}원 결제 완료`
      : `⚠️ 이번 결제 실패: ${charge.message ?? '사유 미상'}`
  sendSlack(
    `🔄 *자동결제 카드 등록* (${cust.customer_type ?? '-'})\n` +
    `업체: ${cust.business_name ?? '-'}\n` +
    `카드: ${cardName ?? '-'} · 다음부터 ${nextChargeLabel(cust)}\n` +
    chargeLine,
  ).catch(() => {})
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { customerId?: string; billingKey?: string; issueId?: string; billingId?: string }
    const { customerId, billingKey, issueId, billingId } = body
    if (!customerId || !billingKey) {
      return NextResponse.json({ error: 'customerId, billingKey 모두 필요합니다' }, { status: 400 })
    }

    const info = await fetchBillingKeyFromPortOne(billingKey)
    if (!info) {
      return NextResponse.json({ error: 'PortOne 서버에서 빌링키를 확인할 수 없습니다. 다시 시도해주세요.' }, { status: 400 })
    }
    if (issueId && info.issueId && info.issueId !== issueId) {
      return NextResponse.json({ error: '카드 등록 요청 정보가 일치하지 않습니다.' }, { status: 403 })
    }

    const supabase = createServiceClient()
    const owner = await validateOwnership(supabase, customerId, billingId, info)
    if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status })

    const cardName = extractCardName(info)
    const { error: updateErr } = await supabase
      .from('customers')
      .update({
        billing_key: billingKey,
        billing_portone_id: issueId ?? null,
        billing_key_status: 'active',
        billing_key_card_name: cardName,
        billing_key_issued_at: new Date().toISOString(),
        billing_card_url: null,       // 등록 링크 토큰 소각
        payment_status_detail: null,  // 기존 실패 사유 초기화
      })
      .eq('id', customerId)
      .neq('billing_key_status', 'active')
    if (updateErr) {
      return NextResponse.json({ error: `DB 저장 실패: ${updateErr.message}` }, { status: 500 })
    }

    if (billingId) {
      const charged = await chargeBillingWithKey(supabase, billingId)
      const { data: b } = await supabase.from('service_billings').select('amount').eq('id', billingId).maybeSingle()
      await recordRegistration(supabase, owner.cust, cardName, {
        attempted: true, ok: charged.ok, message: charged.ok ? undefined : charged.message, amount: Number(b?.amount ?? 0),
      })
      return NextResponse.json({ ok: true, cardName, charged: charged.ok, chargeError: charged.ok ? null : charged.message })
    }
    await recordRegistration(supabase, owner.cust, cardName, { attempted: false, ok: true })
    return NextResponse.json({ ok: true, cardName })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
