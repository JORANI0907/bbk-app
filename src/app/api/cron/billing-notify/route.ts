/**
 * 정기(딥/엔드) 결제 안내 통합 cron (2026-11-01)
 *
 * 이 cron 하나가 정기 고객 결제 안내를 전담한다.
 *   (이전: reservation-reminders 섹션4 + billing-payment-reminders + billing-send-link 세 곳이
 *    각자 다른 기준으로 돌며 하루 2회 발송·링크 누락·템플릿 부재 에러가 겹쳤음)
 *
 * 판정은 청구서(service_billings) 1장 기준, 규칙은 src/lib/billing-notify-policy.ts:
 *   - notify_start_date 당일 → 3일 뒤 → 7일 뒤, 최대 3회. 결제되면 즉시 중단.
 *   - 건별(per_visit) 청구서는 작업완료 시점에 notify_start_date 가 채워진다 (없으면 대기).
 *   - 매월 지정일 청구서는 notify_start_date 없으면 여기서 계산해 채운다 (선불 D-3 / 후불 당일).
 *   - 연간 청구서는 결제일 도래 시 관리자에게 재계약 안내 1회.
 *   - 빌링키(자동결제 카드) 고객은 문자 대신 바로 결제.
 *
 * 호출: Make.com 시나리오 9993323 (매일 09:10 KST) → GET /api/cron/billing-notify
 *   ?dry_run=1 : 실제 발송·DB 변경 없이 오늘 누구에게 몇 차를 보낼지만 돌려준다 (로컬 확인용)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSlack } from '@/lib/slack'
import { sendSmsOrLms } from '@/lib/solapi'
import {
  computeNotifyStartDate, decideSend, todayKstIso, diffDaysIso, MAX_NOTIFY_ATTEMPTS,
  type BillingTrigger, type BillingTiming,
} from '@/lib/billing-notify-policy'
import { sendRecurringBillingNotice } from '@/lib/recurring-billing-notice'

const CRON_SECRET = process.env.CRON_SECRET
const ADMIN_PHONE = process.env.ADMIN_PHONE ?? '01054344877'

type BillingRow = {
  id: string
  billing_type: string
  billing_period: string
  due_date: string | null
  amount: number | null
  billing_timing: BillingTiming | null
  notify_start_date: string | null
  send_attempts: number | null
  last_notified_at: string | null
  application_id: string | null
  customers: {
    id: string
    business_name: string | null
    customer_type: string | null
    billing_trigger: BillingTrigger | null
    status: string | null
    auto_notification_paused: boolean | null
    billing_key_status: string | null
  }
}

/** 결제기한이 이만큼 지난 옛 청구서는 자동 발송하지 않는다 (개편 첫 실행 때 묵은 건 일괄 발송 방지) */
const STALE_DAYS = 45

interface Summary {
  date: string
  scanned: number
  sent: number
  autoCharged: number
  failed: number
  skipped: Record<string, number>
  maxReached: string[]
  wouldSend: string[]
  errors: Array<{ billing_id: string; reason: string }>
}

function bump(s: Summary, key: string) {
  s.skipped[key] = (s.skipped[key] ?? 0) + 1
}

async function remindAdminAnnual(supabase: ReturnType<typeof createServiceClient>, row: BillingRow, today: string): Promise<'sent' | 'skip'> {
  if (!row.due_date || row.due_date > today) return 'skip'
  if (row.last_notified_at) return 'skip'   // 1회만
  const msg = `[BBK 공간케어] 연간 계약 갱신 필요\n${row.customers.business_name ?? '-'} 고객의 연간 계약 결제일(${row.due_date})이 도래했습니다.\n재계약 진행을 확인해 주세요.`
  await sendSmsOrLms(ADMIN_PHONE, msg, {})
  await supabase.from('service_billings').update({ last_notified_at: new Date().toISOString() }).eq('id', row.id)
  return 'sent'
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (!CRON_SECRET) return NextResponse.json({ error: 'CRON_SECRET 미설정' }, { status: 500 })
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dryRun = request.nextUrl.searchParams.get('dry_run') === '1'
  const supabase = createServiceClient()
  const today = todayKstIso()
  const summary: Summary = { date: today, scanned: 0, sent: 0, autoCharged: 0, failed: 0, skipped: {}, maxReached: [], wouldSend: [], errors: [] }

  const { data, error } = await supabase
    .from('service_billings')
    .select(`
      id, billing_type, billing_period, due_date, amount, billing_timing,
      notify_start_date, send_attempts, last_notified_at, application_id,
      customers!inner(id, business_name, customer_type, billing_trigger, status, auto_notification_paused, billing_key_status)
    `)
    .eq('status', 'pending')
    .in('customers.customer_type', ['정기딥케어', '정기엔드케어'])
    .is('customers.deleted_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  for (const row of (data ?? []) as unknown as BillingRow[]) {
    summary.scanned++
    const cust = row.customers
    try {
      if (cust.status === 'paused' || cust.auto_notification_paused) { bump(summary, 'paused'); continue }

      if (row.billing_type === 'annual') {
        if (dryRun) { bump(summary, row.due_date && row.due_date <= today && !row.last_notified_at ? 'annual_admin_would_remind' : 'annual_waiting'); continue }
        const r = await remindAdminAnnual(supabase, row, today)
        bump(summary, r === 'sent' ? 'annual_admin_reminded' : 'annual_waiting')
        continue
      }

      if (Number(row.amount ?? 0) <= 0) { bump(summary, 'zero_amount'); continue }

      // 알림 시작일 확보
      let notifyStart = row.notify_start_date
      if (!notifyStart) {
        if (cust.billing_trigger === 'per_visit') { bump(summary, 'per_visit_waiting_work_complete'); continue }
        if (row.due_date && diffDaysIso(row.due_date, today) > STALE_DAYS) { bump(summary, 'stale_skipped'); continue }
        notifyStart = computeNotifyStartDate({
          trigger: cust.billing_trigger, timing: row.billing_timing, dueDate: row.due_date,
        })
        if (!notifyStart) { bump(summary, 'no_due_date'); continue }
        if (!dryRun) await supabase.from('service_billings').update({ notify_start_date: notifyStart }).eq('id', row.id)
      }

      // 자동결제 카드 등록 고객: 미리 문자를 보내지 않고 결제기한 당일에 바로 결제. 실패하면 그때부터 문자 안내.
      const hasKey = cust.billing_key_status === 'active'
      if (hasKey && row.due_date && today < row.due_date) { bump(summary, 'autopay_waiting_due'); continue }

      const decision = decideSend({
        todayIso: today, notifyStartDate: notifyStart,
        sendAttempts: Number(row.send_attempts ?? 0), lastNotifiedAt: row.last_notified_at,
      })
      if (!decision.send) { bump(summary, decision.reason); continue }
      if (dryRun) { summary.wouldSend.push(`${cust.business_name ?? '-'} (${row.billing_period}) ${decision.attemptNo}차`); continue }

      const r = await sendRecurringBillingNotice(supabase, row.id, { method: 'auto', source: 'cron/billing-notify', tryAutoCharge: hasKey })
      if (!r.ok) {
        summary.failed++
        summary.errors.push({ billing_id: row.id, reason: `${cust.business_name ?? '-'}: ${r.message}` })
        continue
      }
      if (r.kind === 'auto_charged') { summary.autoCharged++; continue }
      summary.sent++
      if (r.attemptNo >= MAX_NOTIFY_ATTEMPTS) summary.maxReached.push(`${cust.business_name ?? '-'} (${row.billing_period})`)
    } catch (e) {
      summary.failed++
      summary.errors.push({ billing_id: row.id, reason: e instanceof Error ? e.message : String(e) })
    }
  }

  if (!dryRun && (summary.sent > 0 || summary.autoCharged > 0 || summary.failed > 0 || summary.maxReached.length > 0)) {
    const lines = [
      `📩 *정기 결제 안내* (${today})`,
      `발송 ${summary.sent}건 · 자동결제 ${summary.autoCharged}건 · 실패 ${summary.failed}건 (대상 ${summary.scanned}건)`,
    ]
    if (summary.maxReached.length > 0) {
      lines.push(`⚠️ 3회 발송 완료 후 미납 → 수동 확인 필요: ${summary.maxReached.join(', ')}`)
    }
    if (summary.errors.length > 0) {
      lines.push(...summary.errors.slice(0, 5).map(e => `  - ${e.reason}`))
    }
    sendSlack(lines.join('\n')).catch(() => {})
  }

  return NextResponse.json({ ok: true, dryRun, ...summary })
}
