/**
 * 정기 결제 안내 자동 발송 cron (2026-10-19 Phase D 재작성)
 *
 * 발송 리듬 (사장님 지시로 단순화):
 *   - 결제일자 3일 전 (D-3)
 *   - 결제일자 당일 (D-0)
 *   총 2회만 자동 발송.
 *   이후 미결제는 사장님이 수동 "결제 안내 재발송" 버튼으로 대응.
 *
 * 조건:
 *   - service_billings.status = 'pending'
 *   - service_billings.payment_url 존재 (Phase B 에서 생성 시 함께 발급됨)
 *   - 오늘이 due_date - 3 또는 due_date 당일
 *   - send_attempts < 2 (중복 발송 방지)
 *
 * 호출 주기: Make.com 매일 KST 09:00
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSlack } from '@/lib/slack'

const CRON_SECRET = process.env.CRON_SECRET
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.bbkorea.co.kr'

type BillingRow = {
  id: string
  customer_id: string | null
  billing_period: string | null
  due_date: string | null
  status: string | null
  service_type: string | null
  payment_url: string | null
  payment_sent_at: string | null
  send_attempts: number | null
}

function todayKstIso(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

function diffDays(dueIso: string, todayIso: string): number {
  const due = new Date(dueIso + 'T00:00:00Z').getTime()
  const today = new Date(todayIso + 'T00:00:00Z').getTime()
  return Math.round((due - today) / (1000 * 60 * 60 * 24))
}

async function findTargetApplicationId(
  supabase: ReturnType<typeof createServiceClient>,
  b: BillingRow,
): Promise<string | null> {
  if (!b.customer_id || !b.billing_period) return null
  const period = b.billing_period
  const isAnnual = /^\d{4}$/.test(period)
  const periodStart = isAnnual ? `${period}-01-01` : `${period}-01`
  const periodEnd = isAnnual ? `${period}-12-31` : `${period}-31`
  const { data: app } = await supabase
    .from('service_applications')
    .select('id')
    .eq('customer_id', b.customer_id)
    .gte('construction_date', periodStart)
    .lte('construction_date', periodEnd)
    .is('deleted_at', null)
    .order('construction_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (app?.id as string | undefined) ?? null
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const todayIso = todayKstIso()

  // pending 결제 중 payment_url 있는 것만 발송 대상
  const { data: billings, error: fetchErr } = await supabase
    .from('service_billings')
    .select('id, customer_id, billing_period, due_date, status, service_type, payment_url, payment_sent_at, send_attempts')
    .eq('status', 'pending')
    .not('payment_url', 'is', null)

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  const results = {
    checked: 0,
    sent: 0,
    skipped_not_due: 0,
    skipped_max_attempts: 0,
    skipped_no_app: 0,
    errors: 0,
  }

  for (const b of (billings ?? []) as BillingRow[]) {
    results.checked++
    try {
      // 발송 조건 체크
      if (!b.due_date) { results.skipped_not_due++; continue }
      const d = diffDays(b.due_date, todayIso)
      // D-3 또는 D-0 만 발송
      if (d !== 3 && d !== 0) { results.skipped_not_due++; continue }
      // 최대 2회 발송 제한
      if ((b.send_attempts ?? 0) >= 2) { results.skipped_max_attempts++; continue }

      const targetAppId = await findTargetApplicationId(supabase, b)
      if (!targetAppId) { results.skipped_no_app++; continue }

      const notifyRes = await fetch(`${APP_BASE_URL}/api/admin/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_id: targetAppId,
          type: '결제알림',
          method: 'auto',
          // 2026-10-19 Phase D: service_billings.payment_url 을 SMS 결제링크 변수로 매핑
          billing_id: b.id,
        }),
      })

      if (!notifyRes.ok) {
        results.errors++
        continue
      }

      await supabase
        .from('service_billings')
        .update({
          payment_sent_at: new Date().toISOString(),
          send_attempts: (b.send_attempts ?? 0) + 1,
        })
        .eq('id', b.id)

      results.sent++
    } catch (e) {
      results.errors++
      console.error(`[billing-send-link] 처리 실패 ${b.id}:`, e instanceof Error ? e.message : e)
    }
  }

  if (results.sent > 0 || results.errors > 0) {
    sendSlack(
      `📩 *결제 안내 자동 발송* (${todayIso})\n` +
      `발송 ${results.sent}건 (D-3 + 당일 2회 리듬) / 에러 ${results.errors}건\n` +
      `skip: 미도래 ${results.skipped_not_due} · 최대도달 ${results.skipped_max_attempts} · 매칭실패 ${results.skipped_no_app}`
    ).catch(() => {})
  }

  return NextResponse.json({ ok: true, ...results })
}
