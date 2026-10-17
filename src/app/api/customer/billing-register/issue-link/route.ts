/**
 * 빌링키 등록 링크 발급 API (2026-10-18 Phase I.2)
 *
 * 역할:
 *   사장님이 특정 고객에 대해 "카드 등록 링크 발송" 버튼을 눌렀을 때
 *   서버가 UUID 토큰을 생성하고 customers 테이블에 저장 → URL 반환.
 *
 * 입력:
 *   POST /api/customer/billing-register/issue-link
 *   body: { customerId: string }
 *
 * 출력:
 *   { url: string, token: string }
 *   or { error: string }
 *
 * DB 변경:
 *   customers.billing_card_url      = 생성된 토큰 (UUID)
 *   customers.billing_key_status    = 'pending' (등록 대기)
 */

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.bbkorea.co.kr'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { customerId?: string }
    const customerId = body.customerId
    if (!customerId) {
      return NextResponse.json({ error: 'customerId 가 필요합니다' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { data: customer, error: fetchErr } = await supabase
      .from('customers')
      .select('id, business_name, billing_key_status')
      .eq('id', customerId)
      .maybeSingle()

    if (fetchErr || !customer) {
      return NextResponse.json(
        { error: fetchErr?.message ?? '고객을 찾을 수 없습니다' },
        { status: 404 },
      )
    }

    if (customer.billing_key_status === 'active') {
      return NextResponse.json(
        { error: '이미 빌링키가 등록되어 있습니다. 재등록이 필요하면 먼저 해제해주세요.' },
        { status: 409 },
      )
    }

    const token = randomUUID()
    const url = `${APP_BASE_URL}/customer/billing-register/${customerId}?t=${token}`

    const { error: updateErr } = await supabase
      .from('customers')
      .update({
        billing_card_url: token,
        billing_key_status: 'pending',
      })
      .eq('id', customerId)

    if (updateErr) {
      return NextResponse.json(
        { error: `DB 저장 실패: ${updateErr.message}` },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true, url, token })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
