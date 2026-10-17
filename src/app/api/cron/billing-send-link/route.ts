/**
 * 정기 결제 안내 자동 발송 cron (2026-10-18 Phase H.2)
 *
 * 사장님 지시 발송 리듬:
 *   정기엔드케어 (선불): 결제예정일 -5일, -3일, 당일, 지난 뒤 격일 (최대 5회) → 2주 지나면 중단
 *   정기딥케어   (후불): 마지막 작업 완료 다음날부터 격일 (최대 7회) → 2주 지나면 중단
 *
 * 발송 로직:
 *   1. pending 상태 service_billings 조회
 *   2. 유형별 조건 체크 (오늘 발송해야 할지)
 *   3. 격일 간격 확인 (payment_sent_at + 2일 지남)
 *   4. 발송 횟수 제한 확인 (send_attempts < max)
 *   5. payment_url 없으면 /api/portone/issue-billing-link 자동 호출해서 생성
 *   6. SMS 발송 (POST /api/admin/notify, type='결제알림')
 *   7. payment_sent_at + send_attempts 업데이트
 *
 * 호출 주기: Make.com 매일 오전 9시 KST 1회
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSlack } from '@/lib/slack'

const CRON_SECRET = process.env.CRON_SECRET
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.bbkorea.co.kr'

const ENDCARE_MAX_ATTEMPTS = 8   // -5/-3/0 + 연체 5회
const DEEPCARE_MAX_ATTEMPTS = 7  // 격일 2주

type BillingRow = {
  id: string
  customer_id: string | null
  billing_type: string | null
  billing_period: string | null
  amount: number | null
  due_date: string | null
  status: string | null
  service_type: string | null
  payment_url: string | null
  payment_sent_at: string | null
  send_attempts: number | null
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  // pending 결제만 (연체 및 미결제 포함)
  const { data: billings, error: fetchErr } = await supabase
    .from('service_billings')
    .select('id, customer_id, billing_type, billing_period, amount, due_date, status, service_type, payment_url, payment_sent_at, send_attempts')
    .eq('status', 'pending')

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  const results = {
    checked: 0,
    sent: 0,
    skipped_too_soon: 0,
    skipped_not_due_yet: 0,
    skipped_max_attempts: 0,
    skipped_no_target_app: 0,
    link_generated: 0,
    errors: 0,
  }
  const sentDetails: string[] = []

  for (const b of (billings ?? []) as BillingRow[]) {
    results.checked++
    try {
      const shouldSend = evaluateSendCondition(b, today)
      if (shouldSend === 'skip_not_due_yet') { results.skipped_not_due_yet++; continue }
      if (shouldSend === 'skip_too_soon')    { results.skipped_too_soon++; continue }
      if (shouldSend === 'skip_max')         { results.skipped_max_attempts++; continue }

      // payment_url 없으면 자동 생성 (issue-billing-link 호출)
      if (!b.payment_url) {
        try {
          const linkRes = await fetch(`${APP_BASE_URL}/api/portone/issue-billing-link`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ billingId: b.id }),
          })
          if (linkRes.ok) {
            results.link_generated++
            // b.payment_url 업데이트 (아래 SMS 발송에 사용)
            const linkData = await linkRes.json() as { paymentUrl?: string }
            if (linkData.paymentUrl) b.payment_url = linkData.paymentUrl
          }
        } catch { /* 링크 생성 실패해도 SMS 발송 계속 (링크 없이) */ }
      }

      // 발송 대상 service_application 1건 찾기 (SMS 변수 매핑용)
      // service_billings 는 month 기준이라 application 1건 필요
      const targetAppId = await findTargetApplicationId(supabase, b)
      if (!targetAppId) {
        results.skipped_no_target_app++
        continue
      }

      // SMS 발송 (POST /api/admin/notify, type='결제알림')
      const notifyRes = await fetch(`${APP_BASE_URL}/api/admin/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_id: targetAppId,
          type: '결제알림',
          method: 'auto',
        }),
      })

      if (!notifyRes.ok) {
        results.errors++
        continue
      }

      // 발송 성공 → send_attempts 증가 + payment_sent_at 업데이트
      await supabase
        .from('service_billings')
        .update({
          payment_sent_at: new Date().toISOString(),
          send_attempts: (b.send_attempts ?? 0) + 1,
        })
        .eq('id', b.id)

      results.sent++
      sentDetails.push(`[${b.service_type ?? '-'}] ${b.billing_period} · 시도 ${(b.send_attempts ?? 0) + 1}회`)
    } catch (e) {
      results.errors++
      console.error(`[billing-send-link] 처리 실패 ${b.id}:`, e instanceof Error ? e.message : e)
    }
  }

  // 결과 Slack (발송 있을 때만)
  if (results.sent > 0 || results.errors > 0) {
    sendSlack(
      `📩 *정기 결제 안내 자동 발송*\n` +
      `발송 ${results.sent}건 (링크 자동생성 ${results.link_generated}건)\n` +
      `skip: 미도래 ${results.skipped_not_due_yet} · 격일간격 ${results.skipped_too_soon} · 최대도달 ${results.skipped_max_attempts} · 매칭실패 ${results.skipped_no_target_app}\n` +
      `에러 ${results.errors}건` +
      (sentDetails.length > 0
        ? `\n\n*발송 세부:*\n${sentDetails.slice(0, 10).join('\n')}` +
          (sentDetails.length > 10 ? `\n... 외 ${sentDetails.length - 10}건` : '')
        : '')
    ).catch(() => {})
  }

  return NextResponse.json({ ok: true, ...results })
}

// ─── 발송 조건 평가 ───────────────────────────────────────────
function evaluateSendCondition(
  b: BillingRow,
  todayStr: string,
): 'send' | 'skip_too_soon' | 'skip_not_due_yet' | 'skip_max' {
  const today = new Date(todayStr)
  const dueDate = b.due_date ? new Date(b.due_date) : null
  const attempts = b.send_attempts ?? 0

  // 최대 횟수 초과 체크 (유형별)
  const isDeepCare = b.service_type === '정기딥케어'
  const maxAttempts = isDeepCare ? DEEPCARE_MAX_ATTEMPTS : ENDCARE_MAX_ATTEMPTS
  if (attempts >= maxAttempts) return 'skip_max'

  // 격일 간격 체크 (payment_sent_at + 2일 지남)
  if (b.payment_sent_at) {
    const lastSent = new Date(b.payment_sent_at)
    const diffMs = today.getTime() - lastSent.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays < 2) return 'skip_too_soon'
  }

  // 유형별 "오늘 발송 대상인지" 체크
  if (!dueDate) return 'skip_not_due_yet'
  const diffDaysToDue = Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (isDeepCare) {
    // 정기딥: due_date 지난 경우만 (후불 — 마지막 작업+7일 지남)
    if (diffDaysToDue > 0) return 'skip_not_due_yet'
    // 격일 간격 OK + 지난 상태면 발송
    return 'send'
  } else {
    // 정기엔드: due 전엔 {-5, -3, 0}일 때만, due 지난 뒤엔 격일
    if (diffDaysToDue > 0) {
      if (diffDaysToDue === 5 || diffDaysToDue === 3) return 'send'
      return 'skip_not_due_yet'
    }
    if (diffDaysToDue === 0) return 'send'  // 당일
    // diffDaysToDue < 0 (연체) → 격일 (이미 위에서 체크됨)
    return 'send'
  }
}

// ─── SMS 변수 매핑용 service_application 1건 찾기 ─────────────
async function findTargetApplicationId(
  supabase: ReturnType<typeof createServiceClient>,
  b: BillingRow,
): Promise<string | null> {
  if (!b.customer_id || !b.billing_period) return null
  const period = b.billing_period
  const isAnnual = /^\d{4}$/.test(period)
  const periodStart = isAnnual ? `${period}-01-01` : `${period}-01`
  const periodEnd   = isAnnual ? `${period}-12-31` : `${period}-31`
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
  return app?.id ?? null
}
