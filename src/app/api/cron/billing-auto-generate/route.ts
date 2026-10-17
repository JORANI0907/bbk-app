/**
 * 정기 결제 자동 생성 cron (2026-10-17 Phase H)
 *
 * 설계 의도:
 * - 지금까지 service_billings 는 관리자가 수동으로 "청구 추가" 모달에서 입력.
 * - 사장님이 결제정보(billing_cycle/amount/start_date 등) 1회 설정하면 cron 이
 *   매월·매년 자동으로 service_billings 레코드 생성.
 * - 결과: 매월 N건 수동 입력 → 예외 건만 수동, 정기 건은 전자동.
 *
 * 로직:
 * 1. customers 중 (정기딥/엔드) AND billing_cycle 설정 AND deleted_at NULL 조회
 * 2. 각 고객에 대해:
 *    - 월간: 이번 달 service_billings 레코드 존재 여부 체크 → 없으면 INSERT
 *    - 연간: 오늘 == (yearly_billing_month, yearly_billing_day) 면 올해 레코드 체크 → INSERT
 * 3. 중복 방지: service_billings 에 (customer_id, billing_period) 이미 있으면 skip (멱등)
 *
 * 호출 주기: Make.com 매일 오전 9시 KST 1회
 *   - 월간: 매월 1일에 신규 레코드 생성 (혹은 billing_start_date 의 일자)
 *   - 연간: yearly_billing_month/day 일치하는 날만 생성
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSlack } from '@/lib/slack'

const CRON_SECRET = process.env.CRON_SECRET

type CustomerRow = {
  id: string
  business_name: string | null
  customer_type: string | null
  billing_cycle: string | null
  billing_amount: number | null
  billing_start_date: string | null
  billing_timing: string | null
  yearly_billing_month: number | null
  yearly_billing_day: number | null
  payment_date: number | null
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const day = now.getDate()
  const monthKey = `${year}-${String(month).padStart(2, '0')}`
  const yearKey = String(year)

  // 1) 정기 거래처 조회 (billing_cycle 설정됨)
  const { data: customers, error: fetchErr } = await supabase
    .from('customers')
    .select('id, business_name, customer_type, billing_cycle, billing_amount, billing_start_date, billing_timing, yearly_billing_month, yearly_billing_day, payment_date')
    .in('customer_type', ['정기딥케어', '정기엔드케어'])
    .not('billing_cycle', 'is', null)
    .is('deleted_at', null)

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  const results = {
    monthly_checked: 0,
    monthly_created: 0,
    annual_checked: 0,
    annual_created: 0,
    skipped_already_exists: 0,
    errors: 0,
  }
  const createdDetails: string[] = []

  for (const c of (customers ?? []) as CustomerRow[]) {
    if (!c.billing_amount || c.billing_amount <= 0) continue

    try {
      // 정기딥 (후불): 월 작업 전부 완료되면 그 월의 결제 생성
      if (c.customer_type === '정기딥케어') {
        results.monthly_checked++
        const inserted = await ensureDeepCareMonthlyBilling(supabase, c, monthKey)
        if (inserted === 'created') {
          results.monthly_created++
          createdDetails.push(`[정기딥] ${c.business_name ?? c.id} · ${monthKey} · ${c.billing_amount.toLocaleString('ko-KR')}원`)
        } else if (inserted === 'exists') {
          results.skipped_already_exists++
        }
        continue
      }

      // 정기엔드 (선불): billing_cycle 에 따라 월간/연간 분기
      if (c.billing_cycle === '월간') {
        results.monthly_checked++
        const inserted = await ensureMonthlyBilling(supabase, c, monthKey, year, month)
        if (inserted === 'created') {
          results.monthly_created++
          createdDetails.push(`[월간] ${c.business_name ?? c.id} · ${monthKey} · ${c.billing_amount.toLocaleString('ko-KR')}원`)
        } else if (inserted === 'exists') {
          results.skipped_already_exists++
        }
      } else if (c.billing_cycle === '연간') {
        results.annual_checked++
        if (c.yearly_billing_month !== month || c.yearly_billing_day !== day) continue
        const inserted = await ensureAnnualBilling(supabase, c, yearKey, year, month, day)
        if (inserted === 'created') {
          results.annual_created++
          createdDetails.push(`[연간] ${c.business_name ?? c.id} · ${yearKey} · ${c.billing_amount.toLocaleString('ko-KR')}원`)
        } else if (inserted === 'exists') {
          results.skipped_already_exists++
        }
      }
    } catch (e) {
      results.errors++
      console.error(`[billing-auto-generate] 처리 실패 ${c.id}:`, e instanceof Error ? e.message : e)
    }
  }

  // Slack 집계 (생성 건 있을 때만)
  if (results.monthly_created > 0 || results.annual_created > 0 || results.errors > 0) {
    sendSlack(
      `💰 *정기 결제 자동 생성*\n` +
      `월간 ${results.monthly_created}건 / 연간 ${results.annual_created}건 생성\n` +
      `(이미 존재 ${results.skipped_already_exists}건 skip, 에러 ${results.errors}건)\n` +
      (createdDetails.length > 0
        ? `\n*생성된 건:*\n${createdDetails.slice(0, 10).join('\n')}` +
          (createdDetails.length > 10 ? `\n... 외 ${createdDetails.length - 10}건` : '')
        : '')
    ).catch(() => {})
  }

  return NextResponse.json({ ok: true, ...results, createdDetails })
}

// ─── 월간 결제 자동 생성 ──────────────────────────────────────
async function ensureMonthlyBilling(
  supabase: ReturnType<typeof createServiceClient>,
  c: CustomerRow,
  monthKey: string,
  year: number,
  month: number,
): Promise<'created' | 'exists'> {
  // 중복 체크
  const { data: existing } = await supabase
    .from('service_billings')
    .select('id')
    .eq('customer_id', c.id)
    .eq('billing_period', monthKey)
    .maybeSingle()
  if (existing) return 'exists'

  // 결제 예정일: payment_date (매월 N일) 또는 billing_start_date 의 일자, 기본 5일
  const dueDay = c.payment_date ?? extractDay(c.billing_start_date) ?? 5
  const safeDay = Math.min(dueDay, lastDayOfMonth(year, month))
  const dueDate = `${monthKey}-${String(safeDay).padStart(2, '0')}`

  await supabase.from('service_billings').insert({
    customer_id: c.id,
    billing_type: 'monthly',
    billing_period: monthKey,
    amount: c.billing_amount!,
    due_date: dueDate,
    status: 'pending',
    billing_timing: c.billing_timing ?? 'prepaid',
    service_type: c.customer_type,
  })
  return 'created'
}

// ─── 연간 결제 자동 생성 ──────────────────────────────────────
async function ensureAnnualBilling(
  supabase: ReturnType<typeof createServiceClient>,
  c: CustomerRow,
  yearKey: string,
  year: number,
  month: number,
  day: number,
): Promise<'created' | 'exists'> {
  const { data: existing } = await supabase
    .from('service_billings')
    .select('id')
    .eq('customer_id', c.id)
    .eq('billing_period', yearKey)
    .maybeSingle()
  if (existing) return 'exists'

  const dueDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  await supabase.from('service_billings').insert({
    customer_id: c.id,
    billing_type: 'annual',
    billing_period: yearKey,
    amount: c.billing_amount!,
    due_date: dueDate,
    status: 'pending',
    billing_timing: c.billing_timing ?? 'prepaid',
    service_type: c.customer_type,
  })
  return 'created'
}

// ─── 정기딥 전용: 월 작업 전부 완료되면 결제 생성 ─────────────
// 판별 기준: 이번 달 service_applications 전부 work_completed_at 세팅됨
// (아직 미완료 작업이 하나라도 있으면 skip → "월 작업 끝났을 때" 트리거)
async function ensureDeepCareMonthlyBilling(
  supabase: ReturnType<typeof createServiceClient>,
  c: CustomerRow,
  monthKey: string,
): Promise<'created' | 'exists' | 'skip_in_progress' | 'skip_no_work'> {
  // 중복 체크
  const { data: existing } = await supabase
    .from('service_billings')
    .select('id')
    .eq('customer_id', c.id)
    .eq('billing_period', monthKey)
    .maybeSingle()
  if (existing) return 'exists'

  // 이번 달 작업 조회
  const monthStart = `${monthKey}-01`
  const monthEnd = `${monthKey}-31`
  const { data: apps } = await supabase
    .from('service_applications')
    .select('id, construction_date, work_completed_at')
    .eq('customer_id', c.id)
    .gte('construction_date', monthStart)
    .lte('construction_date', monthEnd)
    .is('deleted_at', null)

  if (!apps || apps.length === 0) return 'skip_no_work'

  // 하나라도 미완료면 skip (아직 월 작업 진행 중)
  const allCompleted = apps.every(a => a.work_completed_at)
  if (!allCompleted) return 'skip_in_progress'

  // 마지막 작업일 (가장 늦은 work_completed_at)
  const sorted = [...apps].sort((a, b) =>
    (b.work_completed_at ?? '').localeCompare(a.work_completed_at ?? ''),
  )
  const lastCompletedAt = sorted[0]?.work_completed_at ?? null
  if (!lastCompletedAt) return 'skip_in_progress'

  // 결제 예정일: 마지막 작업 완료일 + 7일 (사장님 수금 유예 기간)
  const dueDate = (() => {
    const base = new Date(lastCompletedAt)
    base.setDate(base.getDate() + 7)
    return base.toISOString().slice(0, 10)
  })()

  await supabase.from('service_billings').insert({
    customer_id: c.id,
    billing_type: 'monthly',
    billing_period: monthKey,
    amount: c.billing_amount!,
    due_date: dueDate,
    status: 'pending',
    billing_timing: 'postpaid',
    service_type: c.customer_type,
  })
  return 'created'
}

// ─── Helpers ──────────────────────────────────────────────────
function extractDay(dateStr: string | null): number | null {
  if (!dateStr) return null
  const match = dateStr.match(/^\d{4}-\d{2}-(\d{2})/)
  return match ? parseInt(match[1], 10) : null
}

function lastDayOfMonth(year: number, month: number): number {
  // month: 1-12
  return new Date(year, month, 0).getDate()
}
