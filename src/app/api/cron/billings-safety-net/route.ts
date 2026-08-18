import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  generateBillingSchedule,
  computeBillingAmountFromCustomer,
  shouldAutoGenerateBillings,
  toMonthlyPeriod,
  calcMonthlyDueDate,
} from '@/lib/billing-generator'

/**
 * Phase 22 v11: billings 자동 생성 안전망 (일일 실행).
 *
 * 처리 대상:
 * 1) 정기딥 연간·정기엔드 월간·정기엔드 연간: 계약기간 대비 누락된 청구 채우기
 *    (계약 저장 훅이 실패했거나 저장 이후 계약기간이 늘어난 경우 안전망)
 * 2) 정기딥 월간: 이번 달에 완료 방문이 하나라도 있으면 그 달 청구 생성
 *    (방문 완료 트리거가 놓쳤거나 legacy 방문 백필용)
 *
 * 인증: CRON_SECRET Bearer 헤더
 * 스케줄: Make.com 시나리오에서 매일 KST 01:00 호출 권장
 */

const CRON_SECRET = process.env.CRON_SECRET

interface CustomerRow {
  id: string
  customer_type: string | null
  billing_cycle: string | null
  billing_timing: 'prepaid' | 'postpaid' | null
  contract_start_date: string | null
  contract_end_date: string | null
  payment_date: number | null
  supply_amount: number | null
  vat: number | null
  billing_amount: number | null
  payment_method: string | null
  business_name: string
}

export async function GET(request: NextRequest) {
  // 인증
  const auth = request.headers.get('authorization')
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // 활성 정기 고객 전체 조회
  // Phase 23: status='paused' 고객은 자동 청구 생성 skip
  const { data: customers, error: cErr } = await supabase
    .from('customers')
    .select('id, customer_type, billing_cycle, billing_timing, contract_start_date, contract_end_date, payment_date, supply_amount, vat, billing_amount, payment_method, business_name')
    .in('customer_type', ['정기딥케어', '정기엔드케어'])
    .neq('status', 'paused')
    .is('deleted_at', null)
    .is('archived_at', null)

  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 })
  }

  const results = {
    scheduleInserted: 0,     // 계약기간 자동생성으로 채워진 건수
    visitInserted: 0,        // 방문 기반으로 생성된 건수 (정기딥 월간)
    scanned: (customers ?? []).length,
    errors: [] as Array<{ customer_id: string; error: string }>,
  }

  for (const c of (customers ?? []) as CustomerRow[]) {
    try {
      const amount = computeBillingAmountFromCustomer(c)
      const timing = c.billing_timing ?? 'prepaid'
      const input = {
        serviceType: c.customer_type,
        billingCycle: c.billing_cycle,
        contractStartDate: c.contract_start_date,
        contractEndDate: c.contract_end_date,
        paymentDay: c.payment_date,
        billingAmount: amount,
        billingTiming: timing,
      }

      // === Case A: 계약기간 기반 자동생성 (정기딥연간·정기엔드월/연간) ===
      if (shouldAutoGenerateBillings(input)) {
        const schedule = generateBillingSchedule(input)
        if (schedule.length > 0) {
          const { data: existing } = await supabase
            .from('service_billings')
            .select('billing_period')
            .eq('customer_id', c.id)
          const existingSet = new Set((existing ?? []).map((r: { billing_period: string }) => r.billing_period))
          const toInsert = schedule
            .filter(s => !existingSet.has(s.billing_period))
            .map(s => ({
              customer_id: c.id,
              billing_type: s.billing_type,
              billing_period: s.billing_period,
              amount: s.amount,
              due_date: s.due_date,
              status: 'pending' as const,
              notes: 'cron 안전망 자동 생성',
              billing_timing: timing,
            }))
          if (toInsert.length > 0) {
            const { error: iErr } = await supabase.from('service_billings').insert(toInsert)
            if (iErr) results.errors.push({ customer_id: c.id, error: iErr.message })
            else results.scheduleInserted += toInsert.length
          }
        }
      }

      // === Case B: 정기딥 월간 — 완료 방문 발생한 달 청구 확보 ===
      // 후납은 Case A(계약기간 자동생성)에서 이미 처리되므로 skip
      // (방문일 기반 due_date 계산은 후납 규칙(계약시작일+K사이클-1일)과 불일치)
      if (c.customer_type === '정기딥케어' && c.billing_cycle === '월간' && amount && amount > 0 && timing !== 'postpaid') {
        // 최근 6개월 내 완료 방문 조회 (오래된 legacy 백필용)
        const sixMonthsAgo = new Date()
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
        const fromISO = sixMonthsAgo.toISOString().slice(0, 10)

        const { data: completedApps } = await supabase
          .from('service_applications')
          .select('construction_date')
          .eq('customer_id', c.id)
          .eq('progress_status', '작업완료')
          .gte('construction_date', fromISO)
          .is('deleted_at', null)

        const monthsWithCompletion = new Set<string>()
        for (const a of completedApps ?? []) {
          if (a.construction_date) monthsWithCompletion.add(toMonthlyPeriod(a.construction_date))
        }

        if (monthsWithCompletion.size > 0) {
          const { data: existingBillings } = await supabase
            .from('service_billings')
            .select('billing_period')
            .eq('customer_id', c.id)
          const existingSet = new Set((existingBillings ?? []).map((r: { billing_period: string }) => r.billing_period))

          for (const period of monthsWithCompletion) {
            if (existingSet.has(period)) continue
            // 그 달의 첫 완료 방문 날짜로 due_date 계산
            const [y, m] = period.split('-').map(Number)
            const firstDay = new Date(y, m - 1, 1)
            const dueDate = calcMonthlyDueDate(firstDay, c.payment_date ?? null)
            const { error: iErr } = await supabase.from('service_billings').insert({
              customer_id: c.id,
              billing_type: 'monthly',
              billing_period: period,
              amount,
              due_date: dueDate,
              status: 'pending',
              notes: 'cron 안전망 방문기반 자동 생성',
              billing_timing: 'prepaid',
            })
            if (iErr) results.errors.push({ customer_id: c.id, error: iErr.message })
            else results.visitInserted += 1
          }
        }
      }
    } catch (e) {
      results.errors.push({
        customer_id: c.id,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return NextResponse.json({
    success: true,
    ...results,
    ranAt: new Date().toISOString(),
  })
}
