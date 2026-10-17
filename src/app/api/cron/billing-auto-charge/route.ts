/**
 * 정기엔드 매월 자동결제 cron (2026-10-18 Phase I.4)
 *
 * 설계 의도:
 * - 고객이 1회만 빌링키 등록 (/portone/billing-register) → customers.billing_key 저장
 * - 매월 payment_date 아침에 이 cron 이 돌아가며 PortOne payWithBillingKey 호출
 * - 성공: service_billings.status='paid' 자동 전환 + 결제완료 알림 트리거
 * - 실패: payment_status_detail 사유 저장 + Slack 알림 → 사장님이 사장님 UI 에서 대응
 *
 * 호출 주기: Make.com 매일 오전 9시 KST
 *   - 오늘이 payment_date 인 active 빌링키 고객만 대상
 *   - 멱등: 이번 달 service_billings 가 이미 'paid' 면 skip
 *
 * 재시도 전략 (현재):
 *   - 오늘 실패 → 내일 cron 이 또 시도 (payment_date 가 오늘이면 매일 1회)
 *   - 다음 payment_date 로 넘어가도 전월 실패분은 따로 처리하지 않음
 *   - 추후 Phase I.5 에서 re-charge 큐 설계 가능
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSlack } from '@/lib/slack'
import {
  getPortOneClient,
  getStoreId,
  isPortOneEnabled,
} from '@/lib/portone'

const CRON_SECRET = process.env.CRON_SECRET

type CustomerRow = {
  id: string
  business_name: string | null
  contact_name: string | null
  contact_phone: string | null
  customer_type: string | null
  billing_key: string | null
  billing_amount: number | null
  billing_monthly_amount: number | null
  payment_date: number | null
}

function todayKST(): { year: number; month: number; day: number; iso: string; period: string } {
  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const year = nowKst.getUTCFullYear()
  const month = nowKst.getUTCMonth() + 1
  const day = nowKst.getUTCDate()
  const iso = nowKst.toISOString().slice(0, 10)
  const period = `${year}-${String(month).padStart(2, '0')}`
  return { year, month, day, iso, period }
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 403 })
  }

  if (!isPortOneEnabled()) {
    return NextResponse.json({ error: '포트원 미설정' }, { status: 503 })
  }

  const { day, iso, period } = todayKST()
  const supabase = createServiceClient()
  const client = getPortOneClient()!

  // 1) 오늘이 payment_date 인 active 빌링키 정기엔드 고객 조회
  const { data: rawCustomers, error: queryErr } = await supabase
    .from('customers')
    .select('id, business_name, contact_name, contact_phone, customer_type, billing_key, billing_amount, billing_monthly_amount, payment_date')
    .eq('customer_type', '정기엔드케어')
    .eq('billing_key_status', 'active')
    .eq('payment_date', day)
    .is('deleted_at', null)

  if (queryErr) {
    return NextResponse.json({ error: `DB 조회 실패: ${queryErr.message}` }, { status: 500 })
  }

  const customers = (rawCustomers ?? []) as CustomerRow[]
  const results: Array<{
    customerId: string
    businessName: string
    amount: number
    status: 'skipped' | 'charged' | 'failed'
    reason?: string
    paymentId?: string
  }> = []

  for (const customer of customers) {
    const amount = Number(customer.billing_monthly_amount ?? customer.billing_amount ?? 0)
    const businessName = customer.business_name ?? '-'

    if (amount <= 0) {
      results.push({ customerId: customer.id, businessName, amount, status: 'skipped', reason: '결제금액 0원' })
      continue
    }
    if (!customer.billing_key) {
      results.push({ customerId: customer.id, businessName, amount, status: 'skipped', reason: 'billing_key 없음' })
      continue
    }

    // 2) 이번 달 service_billings 레코드 ensure
    const { data: existing } = await supabase
      .from('service_billings')
      .select('id, status, payment_portone_id')
      .eq('customer_id', customer.id)
      .eq('billing_period', period)
      .eq('billing_type', 'monthly')
      .maybeSingle()

    if (existing?.status === 'paid') {
      results.push({ customerId: customer.id, businessName, amount, status: 'skipped', reason: '이미 결제완료' })
      continue
    }

    let billingId = existing?.id as string | undefined
    let paymentId = existing?.payment_portone_id as string | undefined

    if (!billingId) {
      const { data: created, error: insertErr } = await supabase
        .from('service_billings')
        .insert({
          customer_id: customer.id,
          billing_type: 'monthly',
          billing_period: period,
          amount,
          due_date: iso,
          status: 'pending',
        })
        .select('id')
        .single()
      if (insertErr || !created) {
        results.push({ customerId: customer.id, businessName, amount, status: 'failed', reason: `service_billings 생성 실패: ${insertErr?.message ?? 'unknown'}` })
        continue
      }
      billingId = created.id as string
    }

    if (!paymentId) {
      // 자동결제 전용 paymentId (webhook 매칭용) — service_billings.id 앞 8자 + 타임스탬프
      const shortId = billingId.replace(/-/g, '').slice(0, 8)
      paymentId = `bbk_autocharge_${shortId}_${Date.now()}`
      await supabase
        .from('service_billings')
        .update({ payment_portone_id: paymentId })
        .eq('id', billingId)
    }

    // 3) PortOne payWithBillingKey 호출
    try {
      const customerName = customer.contact_name ?? businessName
      const phone = (customer.contact_phone ?? '').replace(/-/g, '')

      await client.payment.payWithBillingKey({
        paymentId,
        storeId: getStoreId(),
        billingKey: customer.billing_key,
        orderName: `${businessName} ${period} 월간 자동결제`,
        amount: { total: amount },
        currency: 'KRW',
        customer: {
          name: { full: customerName },
          ...(phone ? { phoneNumber: phone } : {}),
        },
      })

      // 4a) 성공 — service_billings.status='paid'
      const nowIso = new Date().toISOString()
      await supabase
        .from('service_billings')
        .update({ status: 'paid', paid_date: iso })
        .eq('id', billingId)

      await supabase
        .from('customers')
        .update({
          billing_last_billed_at: nowIso,
          payment_status_detail: null,
        })
        .eq('id', customer.id)

      results.push({ customerId: customer.id, businessName, amount, status: 'charged', paymentId })
    } catch (e) {
      // 4b) 실패 — payment_status_detail 저장
      const msg = e instanceof Error ? e.message : String(e)
      await supabase
        .from('customers')
        .update({ payment_status_detail: `자동결제 실패 (${iso}): ${msg.slice(0, 200)}` })
        .eq('id', customer.id)

      results.push({ customerId: customer.id, businessName, amount, status: 'failed', reason: msg })
    }
  }

  // 5) Slack 요약 알림
  const chargedCount = results.filter(r => r.status === 'charged').length
  const failedCount = results.filter(r => r.status === 'failed').length
  const totalChargedAmount = results.filter(r => r.status === 'charged').reduce((sum, r) => sum + r.amount, 0)

  if (customers.length > 0) {
    const lines = [
      `💳 *정기엔드 매월 자동결제* (${iso})`,
      `• 대상: ${customers.length}건 · 결제완료: ${chargedCount}건 · 실패: ${failedCount}건`,
      `• 결제 총액: ${totalChargedAmount.toLocaleString('ko-KR')}원`,
    ]
    if (failedCount > 0) {
      const failedLines = results
        .filter(r => r.status === 'failed')
        .map(r => `  - ${r.businessName}: ${r.reason?.slice(0, 100) ?? ''}`)
      lines.push('⚠️ *실패 내역*', ...failedLines)
    }
    await sendSlack(lines.join('\n'))
  }

  return NextResponse.json({
    ok: true,
    date: iso,
    total: customers.length,
    charged: chargedCount,
    failed: failedCount,
    totalChargedAmount,
    results,
  })
}
