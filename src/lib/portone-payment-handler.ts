/**
 * PortOne 결제 완료 공통 처리 — webhook 과 폴링 cron 양쪽에서 재사용.
 *
 * 2026-10-15 분리 배경:
 * Next.js App Router 의 route.ts 는 HTTP 핸들러만 export 가능 →
 * handleTransactionPaid 를 lib 로 꺼내서 webhook/route.ts + cron/vbank-polling 공유.
 */

import { createServiceClient } from '@/lib/supabase/server'
import { fetchPaidInfo } from '@/lib/portone-method'
import { sendSlack } from '@/lib/slack'
import { notifyPaymentCompleteAdmin } from '@/lib/solapi'
import { isExtraBilling, sendExtraBillingPaidNotice } from '@/lib/extra-billing-notice'

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.bbkorea.co.kr'

// 자동 알림 발송 헬퍼 — fire-and-forget (실패해도 결제 처리 성공 유지)
async function triggerAutoNotify(applicationId: string, type: string) {
  try {
    await fetch(`${APP_BASE_URL}/api/admin/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ application_id: applicationId, type, method: 'auto' }),
    })
  } catch {
    // 알림 실패 조용히 무시
  }
}

/** 1회성 추가 결제 입금 확인 → Slack + 관리자 문자 + 고객 완료 문자 (2026-11-08) */
async function notifyExtraBillingPaid(
  supabase: ReturnType<typeof createServiceClient>,
  row: { id: string; customer_id: string | null; amount: number | null; notes: string | null },
  paymentId: string,
): Promise<void> {
  let businessName = '-'
  let ownerName = ''
  if (row.customer_id) {
    const { data: cust } = await supabase
      .from('customers')
      .select('business_name, contact_name')
      .eq('id', row.customer_id)
      .maybeSingle()
    businessName = (cust?.business_name as string | null) ?? '-'
    ownerName = (cust?.contact_name as string | null) ?? ''
  }
  const amount = Number(row.amount ?? 0)
  sendSlack(
    `💳 *추가 결제 완료* (1회성케어)\n` +
    `업체: ${businessName} / 고객: ${ownerName || '-'}\n` +
    `내용: ${row.notes ?? '-'} · 금액: ${amount.toLocaleString('ko-KR')}원\n` +
    `결제ID: ${paymentId}`,
  ).catch(() => {})
  notifyPaymentCompleteAdmin({ stageLabel: '추가 결제', businessName, ownerName, amount }).catch(() => {})
  await sendExtraBillingPaidNotice(supabase, row.id, paymentId)
}

/**
 * Transaction.Paid 처리 — paymentId 로 deposit/balance 매칭 후 DB 업데이트 + Slack + SMS 트리거.
 * 멱등: 이미 paid_at 세팅된 건은 조용히 return (중복 호출 안전).
 */
export async function handleTransactionPaid(paymentId: string): Promise<void> {
  const supabase = createServiceClient()

  // deposit 매칭
  const { data: depositRow } = await supabase
    .from('service_applications')
    .select('id, owner_name, business_name, deposit, supply_amount, vat, deposit_paid_at, customer_id')
    .eq('deposit_portone_id', paymentId)
    .is('deleted_at', null)
    .maybeSingle()

  if (depositRow) {
    if (depositRow.deposit_paid_at) return

    const nowIso = new Date().toISOString()
    const paid = await fetchPaidInfo(paymentId)   // 2026-11-01: 예약금 실제 수단 / 2026-11-03: 실제 금액
    const paidMethod = paid.method
    const depositAmount = paid.amount ?? Number(depositRow.deposit ?? 0)
    const { data: updated } = await supabase
      .from('service_applications')
      .update({
        ...(paidMethod ? { deposit_payment_method: paidMethod } : {}),
        deposit_paid_at: nowIso,
        payment_confirmed_at: nowIso,
        payment_status: 'paid',
        payment_status_detail: '예약금 입금',
        deposit: depositAmount,
      })
      .eq('id', depositRow.id)
      .is('deposit_paid_at', null)
      .select('id')

    if (!updated || updated.length === 0) return

    if (depositRow.customer_id) {
      try {
        await supabase
          .from('customers')
          .update({ deposit_paid_at: nowIso, deposit: depositAmount, ...(paidMethod ? { deposit_payment_method: paidMethod } : {}) })
          .eq('id', depositRow.customer_id)
      } catch { /* 동기화 실패 무시 */ }
    }

    sendSlack(
      `💳 *예약금(1차) 결제 완료 — 가상계좌 입금*\n` +
      `업체: ${depositRow.business_name ?? '-'} / 고객: ${depositRow.owner_name ?? '-'}\n` +
      `금액: ${Number(depositRow.deposit ?? 0).toLocaleString('ko-KR')}원\n` +
      `결제ID: ${paymentId}`,
    ).catch(() => {})

    // 관리자 SMS (Slack 과 병행)
    notifyPaymentCompleteAdmin({
      stageLabel: '예약금(1차)',
      businessName: depositRow.business_name ?? '',
      ownerName: depositRow.owner_name ?? '',
      amount: depositAmount,
    }).catch(() => {})

    await triggerAutoNotify(depositRow.id, '예약금 입금완료 알림')
    return
  }

  // balance 매칭 (SMS 요약용으로 balance 컬럼도 함께 조회)
  const { data: balanceRow } = await supabase
    .from('service_applications')
    .select('id, owner_name, business_name, balance_paid_at, balance, supply_amount, vat, deposit')
    .eq('balance_portone_id', paymentId)
    .is('deleted_at', null)
    .maybeSingle()

  if (balanceRow) {
    if (balanceRow.balance_paid_at) return

    const nowIso = new Date().toISOString()
    const paid = await fetchPaidInfo(paymentId)   // 2026-11-01: 잔금 실제 수단 / 2026-11-03: 실제 금액
    const paidMethod = paid.method
    // 2026-11-03: 신청서 잔금 칸이 0 으로 남는 경우(견적은 고객 마스터에만 저장)가 있어 실제 결제 금액을 우선,
    //   없으면 저장된 잔금, 그것도 없으면 공급가+부가세-예약금으로 계산해 문자·Slack·DB 에 기록
    const storedBalance = Number(balanceRow.balance ?? 0)
    const computedBalance = Number(balanceRow.supply_amount ?? 0) + Number(balanceRow.vat ?? 0) - Number(balanceRow.deposit ?? 0)
    const balanceAmount = paid.amount ?? (storedBalance > 0 ? storedBalance : Math.max(computedBalance, 0))
    const { data: updated } = await supabase
      .from('service_applications')
      .update({
        ...(paidMethod ? { balance_payment_method: paidMethod } : {}),
        ...(storedBalance <= 0 && balanceAmount > 0 ? { balance: balanceAmount } : {}),
        balance_paid_at: nowIso,
        payment_confirmed_at: nowIso,
        payment_status: 'paid',
        payment_status_detail: '결제완료',
      })
      .eq('id', balanceRow.id)
      .is('balance_paid_at', null)
      .select('id')

    if (!updated || updated.length === 0) return

    try {
      const { data: link } = await supabase
        .from('service_applications')
        .select('customer_id')
        .eq('id', balanceRow.id)
        .maybeSingle()
      if (link?.customer_id) {
        await supabase
          .from('customers')
          .update({ balance_paid_at: nowIso, ...(paidMethod ? { balance_payment_method: paidMethod } : {}) })
          .eq('id', link.customer_id)
      }
    } catch { /* 동기화 실패 무시 */ }

    sendSlack(
      `💳 *잔금(2차) 결제 완료*\n` +
      `업체: ${balanceRow.business_name ?? '-'} / 고객: ${balanceRow.owner_name ?? '-'}\n` +
      `금액: ${balanceAmount.toLocaleString('ko-KR')}원\n` +
      `결제ID: ${paymentId}`,
    ).catch(() => {})

    // 관리자 SMS (Slack 과 병행)
    notifyPaymentCompleteAdmin({
      stageLabel: '잔금(2차)',
      businessName: balanceRow.business_name ?? '',
      ownerName: balanceRow.owner_name ?? '',
      amount: balanceAmount,
    }).catch(() => {})

    await triggerAutoNotify(balanceRow.id, '결제완료알림(잔금)')
    return
  }

  // Phase H.3 (2026-10-17): 정기 결제(service_billings) 매칭
  // payment_portone_id 컬럼이 아직 마이그레이션 전이면 조회 자체가 에러 — try/catch 로 격리.
  try {
    const BILLING_COLS = 'id, customer_id, amount, billing_type, billing_period, status, service_type, notes'
    const { data: currentRow } = await supabase
      .from('service_billings')
      .select(BILLING_COLS)
      .eq('payment_portone_id', paymentId)
      .maybeSingle()
    // 2026-11-03: 결제 ID 초기화 후 옛 가상계좌로 입금된 경우 → previous_payment_ids 로 매칭
    const { data: previousRow } = currentRow ? { data: null } : await supabase
      .from('service_billings')
      .select(BILLING_COLS)
      .contains('previous_payment_ids', [paymentId])
      .maybeSingle()
    const billingRow = currentRow ?? previousRow

    if (!billingRow) return
    if (billingRow.status === 'paid') return  // 멱등: 이미 완료

    // 2026-11-08: 실제 결제수단을 스냅샷에 남긴다 (결제상태 요약·세금계산서 분리 판정에 사용)
    const paid = await fetchPaidInfo(paymentId)
    const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)  // KST 날짜
    const { data: updated } = await supabase
      .from('service_billings')
      .update({ status: 'paid', paid_date: today, ...(paid.method ? { payment_method_snapshot: paid.method } : {}) })
      .eq('id', billingRow.id)
      .neq('status', 'paid')
      .select('id')

    if (!updated || updated.length === 0) return

    // 1회성 추가 결제는 정기 흐름과 분리 — 신청서 진행상태를 건드리지 않고 전용 완료 문자만 보낸다
    if (isExtraBilling(billingRow)) {
      await notifyExtraBillingPaid(supabase, billingRow, paymentId)
      return
    }

    // customers 조회 (Slack 메시지용)
    let businessName = '-'
    if (billingRow.customer_id) {
      const { data: cust } = await supabase
        .from('customers')
        .select('business_name')
        .eq('id', billingRow.customer_id)
        .maybeSingle()
      businessName = cust?.business_name ?? '-'
    }

    const typeLabel = billingRow.billing_type === 'annual' ? '연간'
      : billingRow.billing_type === 'onetime' ? '추가' : '월간'
    sendSlack(
      `💳 *정기 결제 완료* (${billingRow.service_type ?? ''} · ${typeLabel})\n` +
      `업체: ${businessName}\n` +
      `기간: ${billingRow.billing_period} · 금액: ${Number(billingRow.amount ?? 0).toLocaleString('ko-KR')}원\n` +
      `결제ID: ${paymentId}`,
    ).catch(() => {})

    // 관리자 SMS (Slack 과 병행) — ownerName 은 billingRow 에 없어 빈 값 전달
    notifyPaymentCompleteAdmin({
      stageLabel: `정기 결제 (${typeLabel})`,
      businessName: businessName,
      ownerName: '',
      amount: Number(billingRow.amount ?? 0),
    }).catch(() => {})

    // Phase H.5-rev: 결제완료 → 그 월(또는 연) 작업들에 자동 '결제완료알림' 발송
    //   → notification_log 에 기록 → 📜 알림 발송 이력 섹션에 자동 반영
    // 대상: 해당 billing_period 와 매칭되는 service_applications 중 첫 번째
    // (여러 건 있어도 1개만 발송 — 동일 메시지 중복 방지)
    if (billingRow.customer_id && billingRow.billing_period) {
      try {
        const period = billingRow.billing_period
        const isAnnual = /^\d{4}$/.test(period)
        // 2026-11-01: 건별 청구서는 billing_period 가 'YYYY-MM-DD' (시공일) — 그날 하루만 매칭
        const isDaily = /^\d{4}-\d{2}-\d{2}$/.test(period)
        const periodStart = isAnnual ? `${period}-01-01` : isDaily ? period : `${period}-01`
        const periodEnd   = isAnnual ? `${period}-12-31` : isDaily ? period : `${period}-31`
        const { data: targetApp } = await supabase
          .from('service_applications')
          .select('id')
          .eq('customer_id', billingRow.customer_id)
          .gte('construction_date', periodStart)
          .lte('construction_date', periodEnd)
          .is('deleted_at', null)
          .order('construction_date', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (targetApp?.id) {
          await triggerAutoNotify(targetApp.id, '결제완료알림')
        }
      } catch { /* 알림 실패는 결제 처리에 영향 없음 */ }
    }
  } catch {
    // service_billings 컬럼 미생성 등 schema 미반영 시 조용히 skip
  }
}
