/**
 * 빌링키 저장 API (2026-10-18 Phase I.2)
 *
 * 역할:
 *   고객이 PortOne UI 에서 카드 등록 완료 후, 클라이언트가 응답으로 받은 billingKey 를
 *   서버로 전송 → customers 테이블에 저장 + 상태 'active' 전환.
 *
 * 보안:
 *   - PortOne 서버에 getBillingKey 재조회로 검증 (위조 방지)
 *   - card 상품명 / 카드 번호 마스킹 등 메타 함께 저장
 *
 * 입력:
 *   POST /api/portone/billing-key-save
 *   body: { customerId: string, billingKey: string, issueId?: string }
 *
 * 출력:
 *   { ok: true, cardName: string }
 *   or { error: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const PORTONE_V2_API_SECRET = process.env.PORTONE_V2_API_SECRET ?? ''
const PORTONE_API_BASE = 'https://api.portone.io'

interface PortOneBillingKeyInfo {
  billingKey?: string
  status?: string
  methods?: Array<{
    type?: string
    card?: {
      issuer?: string
      publisher?: string
      brand?: string
      name?: string
      number?: string
    }
  }>
}

async function fetchBillingKeyFromPortOne(billingKey: string): Promise<PortOneBillingKeyInfo | null> {
  if (!PORTONE_V2_API_SECRET) return null
  try {
    const res = await fetch(
      `${PORTONE_API_BASE}/billing-keys/${encodeURIComponent(billingKey)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `PortOne ${PORTONE_V2_API_SECRET}`,
          'Content-Type': 'application/json',
        },
      },
    )
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      customerId?: string
      billingKey?: string
      issueId?: string
    }
    const { customerId, billingKey, issueId } = body

    if (!customerId || !billingKey) {
      return NextResponse.json(
        { error: 'customerId, billingKey 모두 필요합니다' },
        { status: 400 },
      )
    }

    // PortOne 서버 재조회로 billingKey 유효성 검증
    const info = await fetchBillingKeyFromPortOne(billingKey)
    if (!info) {
      return NextResponse.json(
        { error: 'PortOne 서버에서 빌링키를 확인할 수 없습니다. 다시 시도해주세요.' },
        { status: 400 },
      )
    }
    const cardName = extractCardName(info)

    const supabase = createServiceClient()

    const { error: updateErr } = await supabase
      .from('customers')
      .update({
        billing_key: billingKey,
        billing_portone_id: issueId ?? null,
        billing_key_status: 'active',
        billing_key_card_name: cardName,
        billing_key_issued_at: new Date().toISOString(),
        billing_card_url: null,  // 토큰 소각 → URL 재사용 차단
        payment_status_detail: null,  // 기존 실패 사유 초기화
      })
      .eq('id', customerId)

    if (updateErr) {
      return NextResponse.json(
        { error: `DB 저장 실패: ${updateErr.message}` },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true, cardName })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
