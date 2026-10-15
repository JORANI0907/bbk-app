/**
 * 가상계좌 입금 폴링 fallback cron (2026-10-15 신규)
 *
 * 배경:
 * PortOne V2 webhook (Transaction.Paid) 이 KG이니시스 측 "입금통보 URL" 설정 누락 등으로
 * 지연·누락되는 사례 발견 (이신열·윤현식 등). webhook 체인에 의존하지 않고 BBK가 능동적으로
 * PortOne getPayment API를 호출해서 PAID 전환된 신청서를 감지.
 *
 * 로직:
 * 1. "입금 대기 중" 상태의 가상계좌 신청서 조회
 *    - deposit_portone_id OR balance_portone_id 있음
 *    - deposit_paid_at OR balance_paid_at NULL (해당 단계만)
 *    - deleted_at NULL
 *    - 가상계좌 발급 유효기간 내(7일) — created_at + 7일 안
 * 2. 각 신청서에 대해 PortOne getPayment 호출
 * 3. status === 'PAID' 면 → handleTransactionPaid 재사용 (멱등성 체크 자동)
 *
 * 호출 주기: Make.com 에서 매 2분 호출 추천.
 *   더 짧으면 PortOne API rate limit·비용↑, 더 길면 고객 대기 시간↑. 2분이 운영 최적.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getPortOneClient, isPortOneEnabled } from '@/lib/portone'
import { handleTransactionPaid } from '@/lib/portone-payment-handler'
import { sendSlack } from '@/lib/slack'

const CRON_SECRET = process.env.CRON_SECRET

type PendingRow = {
  id: string
  business_name: string | null
  owner_name: string | null
  deposit_portone_id: string | null
  balance_portone_id: string | null
  deposit_paid_at: string | null
  balance_paid_at: string | null
  payment_method: string | null
  created_at: string
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isPortOneEnabled()) {
    return NextResponse.json({ ok: true, skipped: 'portone_disabled' })
  }
  const client = getPortOneClient()!
  const supabase = createServiceClient()

  // 가상계좌 발급 유효기간 7일(issue-payment-link validHours: 24*7) 내 신청서만 체크
  const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // 1) 예약금 대기: deposit_portone_id 있고 deposit_paid_at NULL
  const { data: depositPending } = await supabase
    .from('service_applications')
    .select('id, business_name, owner_name, deposit_portone_id, balance_portone_id, deposit_paid_at, balance_paid_at, payment_method, created_at')
    .not('deposit_portone_id', 'is', null)
    .is('deposit_paid_at', null)
    .is('deleted_at', null)
    .gte('created_at', sevenDaysAgoIso)

  // 2) 잔금 대기: balance_portone_id 있고 balance_paid_at NULL (예약금 완료된 건들)
  const { data: balancePending } = await supabase
    .from('service_applications')
    .select('id, business_name, owner_name, deposit_portone_id, balance_portone_id, deposit_paid_at, balance_paid_at, payment_method, created_at')
    .not('balance_portone_id', 'is', null)
    .is('balance_paid_at', null)
    .is('deleted_at', null)
    .gte('created_at', sevenDaysAgoIso)

  const results = {
    deposit_checked: 0,
    deposit_paid: 0,
    balance_checked: 0,
    balance_paid: 0,
    errors: 0,
  }

  // 예약금 폴링
  for (const row of (depositPending ?? []) as PendingRow[]) {
    if (!row.deposit_portone_id) continue
    results.deposit_checked++
    try {
      const payment = await client.payment.getPayment({ paymentId: row.deposit_portone_id }) as Record<string, unknown>
      const status = String(payment.status ?? '')
      if (status === 'PAID') {
        await handleTransactionPaid(row.deposit_portone_id)
        results.deposit_paid++
      }
    } catch (e) {
      results.errors++
      console.error(`[vbank-polling] deposit 조회 실패 ${row.deposit_portone_id}:`, e instanceof Error ? e.message : e)
    }
  }

  // 잔금 폴링
  for (const row of (balancePending ?? []) as PendingRow[]) {
    if (!row.balance_portone_id) continue
    results.balance_checked++
    try {
      const payment = await client.payment.getPayment({ paymentId: row.balance_portone_id }) as Record<string, unknown>
      const status = String(payment.status ?? '')
      if (status === 'PAID') {
        await handleTransactionPaid(row.balance_portone_id)
        results.balance_paid++
      }
    } catch (e) {
      results.errors++
      console.error(`[vbank-polling] balance 조회 실패 ${row.balance_portone_id}:`, e instanceof Error ? e.message : e)
    }
  }

  // 결제 감지 시 집계 Slack (0건이면 조용히 지나감 — 매 2분 알림 과다 방지)
  if (results.deposit_paid > 0 || results.balance_paid > 0) {
    sendSlack(
      `🔁 *가상계좌 폴링 복구*\n` +
      `예약금 ${results.deposit_paid}건 / 잔금 ${results.balance_paid}건 자동 처리됨 (webhook 지연·누락 보완)`
    ).catch(() => {})
  }

  return NextResponse.json({ ok: true, ...results })
}
