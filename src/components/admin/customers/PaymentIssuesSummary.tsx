'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, DollarSign, FileText, CreditCard } from 'lucide-react'

/**
 * Phase 22 v6~9: 고객의 미해결 결제/계산서 이슈 요약.
 * - 세부화면 이번달 일정 위 (full mode)
 * - 정기딥/정기엔드 리스트 미리보기 4번 열 (compact mode)
 *
 * 데이터 소스 이원화 (v9):
 * - 정기엔드케어: billings 테이블 (월/연 단위 청구 이력). 안 된 월/연도 감지
 * - 그 외 (정기딥·1회성): service_applications (일정별 진행/결제 상태)
 *
 * 결제 대기 판정 정확도 개선 (v11):
 * - 정기엔드케어: due_date(결제일)가 실제로 도래한 청구만 결제 대기로 판정
 * - 정기딥·1회성: 해당 달의 모든 시공이 '작업완료'일 때만 결제 대기로 판정 (월 단위 그룹핑)
 */

interface ApplicationLite {
  id: string
  construction_date: string | null
  progress_status: string | null
  payment_status_detail: string | null
  payment_method: string | null
}

interface BillingLite {
  id: string
  billing_period: string
  billing_type: 'monthly' | 'annual'
  status: 'pending' | 'paid' | 'overdue'
  tax_invoice_issued: boolean | null
  due_date: string | null
}

// 결제/계산서 완결 상태들 — 이 값이면 결제 대기가 아님
const PAYMENT_SETTLED = new Set([
  '결제완료', '결제완료(잔금)', '계산서발행완료', '카드결제 완료', '비과세', '예약금환급완료',
])

// 결제 완료됐지만 계산서는 아직인 상태
const PAYMENT_PAID_NEEDS_INVOICE = new Set([
  '결제완료', '결제완료(잔금)', '카드결제 완료',
])

// 계산서 발행이 필요없는 결제 방법 (비과세·카드 간편결제 등)
const NO_INVOICE_METHODS = new Set(['현금(비과세)', '카드(온라인 간편결제)', '플랫폼'])

interface Props {
  /** Phase 22 v8: customer_id 최우선 매칭 — 같은 phone/business_name을 공유하는 다른 유형 계약과 안전 분리 */
  customerId?: string | null
  phone?: string | null
  businessName?: string | null
  /** 결제방법 (customers.payment_method) — 요약 상단에 함께 노출 */
  paymentMethod?: string | null
  /** Phase 22 v9: 정기엔드케어는 billings 기반, 그 외는 service_applications 기반 */
  customerType?: string | null
  compact?: boolean
}

function fmtShortDate(d: string | null): string {
  if (!d) return '-'
  return d.slice(5, 10).replace('-', '.')
}

export function PaymentIssuesSummary({
  customerId = null, phone, businessName, paymentMethod = null, customerType = null, compact = false,
}: Props) {
  const [apps, setApps] = useState<ApplicationLite[] | null>(null)
  const [billings, setBillings] = useState<BillingLite[] | null>(null)
  const [loading, setLoading] = useState(false)

  const useBillingsMode = customerType === '정기엔드케어'

  useEffect(() => {
    if (useBillingsMode) {
      if (!customerId) { setBillings([]); return }
      setLoading(true)
      fetch(`/api/admin/billings?customer_id=${customerId}`)
        .then(r => r.json())
        .then(j => setBillings(j.billings ?? []))
        .catch(() => setBillings([]))
        .finally(() => setLoading(false))
      return
    }
    // 일정별 모드 (정기딥·1회성 등)
    if (!customerId && !phone && !businessName) {
      setApps([])
      return
    }
    setLoading(true)
    const params = new URLSearchParams()
    if (customerId) params.set('customer_id', customerId)
    else if (phone) params.set('phone', phone)
    else if (businessName) params.set('business_name', businessName)
    fetch(`/api/admin/applications?${params.toString()}`)
      .then(r => r.json())
      .then(j => setApps(j.applications ?? []))
      .catch(() => setApps([]))
      .finally(() => setLoading(false))
  }, [useBillingsMode, customerId, phone, businessName])

  // 이슈 판별: 모드별로 다른 데이터 소스
  // Phase 22 v10: 결제·계산서는 사후 사건 → 미래 예정 일정/청구는 이슈 감지에서 제외
  const now = new Date()
  const todayISO = now.toISOString().slice(0, 10)
  const currentYear = String(now.getFullYear())
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const paymentPendingLabels: string[] = []
  const invoicePendingLabels: string[] = []

  if (useBillingsMode) {
    for (const b of billings ?? []) {
      // 미래 청구 기간은 이슈 대상 아님
      const isFuture = b.billing_type === 'annual'
        ? b.billing_period > currentYear
        : b.billing_period > currentMonth
      if (isFuture) continue

      if (b.status !== 'paid') {
        // v11: due_date(결제일)가 아직 도래하지 않은 청구는 결제 대기가 아님
        const dueReached = b.due_date && b.due_date.slice(0, 10) <= todayISO
        if (dueReached) paymentPendingLabels.push(b.billing_period)
      } else if (!b.tax_invoice_issued && !NO_INVOICE_METHODS.has(paymentMethod ?? '')) {
        invoicePendingLabels.push(b.billing_period)
      }
    }
  } else {
    // v11: 정기딥·1회성 — 결제 대기는 '해당 달 시공이 모두 완료'된 경우에만 판정 (월 단위 그룹핑)
    const appsByMonth = new Map<string, ApplicationLite[]>()
    for (const a of apps ?? []) {
      const dateISO = a.construction_date?.slice(0, 10)
      if (!dateISO) continue
      const yearMonth = dateISO.slice(0, 7)
      if (yearMonth > currentMonth) continue // 미래 달 시공은 제외 (현재 달 내 미래 시공은 포함 → allCompleted 판정에 반영)
      const bucket = appsByMonth.get(yearMonth) ?? []
      bucket.push(a)
      appsByMonth.set(yearMonth, bucket)
    }

    for (const [yearMonth, monthApps] of appsByMonth) {
      // 그 달의 모든 시공이 '작업완료'일 때만 결제 대기 후보
      const allCompleted = monthApps.every(a => a.progress_status === '작업완료')
      if (allCompleted) {
        const anyNotSettled = monthApps.some(
          a => !(a.payment_status_detail && PAYMENT_SETTLED.has(a.payment_status_detail)),
        )
        if (anyNotSettled) paymentPendingLabels.push(yearMonth)
      }

      // 계산서 대기: 개별 시공 단위 (기존 로직 유지)
      for (const a of monthApps) {
        const dateISO = a.construction_date?.slice(0, 10)
        if (dateISO && dateISO > todayISO) continue // 미래 시공은 계산서 논의 대상 아님
        if (
          a.payment_status_detail &&
          PAYMENT_PAID_NEEDS_INVOICE.has(a.payment_status_detail) &&
          !NO_INVOICE_METHODS.has(a.payment_method ?? '')
        ) {
          invoicePendingLabels.push(fmtShortDate(a.construction_date))
        }
      }
    }
  }

  const hasIssues = paymentPendingLabels.length > 0 || invoicePendingLabels.length > 0

  if (loading) {
    return <span className="text-[11px] text-text-tertiary">확인 중...</span>
  }

  if (compact) {
    return (
      <div className="flex flex-col gap-0.5">
        {paymentMethod && (
          <div className="text-[11px] text-text-secondary truncate flex items-center gap-1">
            <CreditCard size={10} className="shrink-0" />
            <span className="truncate">{paymentMethod}</span>
          </div>
        )}
        {!hasIssues ? (
          <span className="text-[11px] text-text-tertiary">이슈 없음</span>
        ) : (
          <>
            {paymentPendingLabels.length > 0 && (
              <div
                className="text-[11px] text-orange-700 truncate"
                title={paymentPendingLabels.join(', ')}
              >
                <DollarSign size={10} className="inline mr-0.5" />
                결제 대기 {paymentPendingLabels.length}건
              </div>
            )}
            {invoicePendingLabels.length > 0 && (
              <div
                className="text-[11px] text-brand-700 truncate"
                title={invoicePendingLabels.join(', ')}
              >
                <FileText size={10} className="inline mr-0.5" />
                계산서 대기 {invoicePendingLabels.length}건
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  // Full mode: 세부화면용
  if (!hasIssues) {
    return (
      <div className="border-2 border-orange-100 bg-orange-50/20 rounded-xl px-3 py-2 flex items-center gap-2 flex-wrap">
        <AlertCircle size={12} className="text-orange-400 shrink-0" />
        <p className="text-[11px] text-text-secondary">미해결 결제·계산서 이슈 없음</p>
        {paymentMethod && (
          <span className="ml-auto text-[11px] text-text-secondary inline-flex items-center gap-1">
            <CreditCard size={11} /> {paymentMethod}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="border-2 border-orange-200 bg-orange-50/40 rounded-xl overflow-hidden">
      <div className="bg-orange-100/60 px-3 py-2 border-b border-orange-200 flex items-center gap-2">
        <AlertCircle size={14} className="text-orange-700 shrink-0" />
        <p className="text-xs font-semibold text-orange-900 uppercase tracking-wide">결제 상태 요약</p>
        {paymentMethod && (
          <span className="ml-auto text-[11px] text-orange-800 font-medium inline-flex items-center gap-1">
            <CreditCard size={11} /> {paymentMethod}
          </span>
        )}
      </div>
      <div className="p-3 space-y-2">
        {paymentPendingLabels.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-orange-700 flex items-center gap-1">
              <DollarSign size={11} /> 결제 대기 · {paymentPendingLabels.length}건
            </p>
            <p className="text-[11px] text-text-secondary mt-0.5 leading-relaxed">
              {paymentPendingLabels.slice(0, 8).join(', ')}
              {paymentPendingLabels.length > 8 && ` 외 ${paymentPendingLabels.length - 8}건`}
            </p>
          </div>
        )}
        {invoicePendingLabels.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-brand-700 flex items-center gap-1">
              <FileText size={11} /> 계산서 대기 · {invoicePendingLabels.length}건
            </p>
            <p className="text-[11px] text-text-secondary mt-0.5 leading-relaxed">
              {invoicePendingLabels.slice(0, 8).join(', ')}
              {invoicePendingLabels.length > 8 && ` 외 ${invoicePendingLabels.length - 8}건`}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
