'use client'

import { useEffect, useState, useCallback } from 'react'

// 관리자용 청구 요약 카드.
// 연간 계약이면 해당 연도의 청구, 월간 계약이면 최근 월의 청구 하나를 대표로 표시.
// 최근 결제일자·결제완료·계산서완료 뱃지·결제 방식을 한눈에.

interface BillingRecord {
  id: string
  billing_type: 'monthly' | 'annual'
  billing_period: string
  amount: number
  due_date: string
  paid_date: string | null
  status: 'pending' | 'paid' | 'overdue'
  tax_invoice_issued: boolean | null
  tax_invoice_issued_date: string | null
}

interface Props {
  customerId: string
  customerType: string        // '정기딥케어' | '정기엔드케어'
  billingCycle: string        // '월간' | '연간'
  paymentMethod: string | null
}

const fmtDate = (d: string | null | undefined) => d ? d.slice(0, 10).replace(/-/g, '.') : '-'

// 연간이면 '2026', 월간이면 '2026-07' 형식으로 대상 기간 결정
function pickTargetRecord(records: BillingRecord[], isAnnual: boolean): BillingRecord | null {
  if (records.length === 0) return null
  const now = new Date()
  if (isAnnual) {
    const currentYear = String(now.getFullYear())
    return (
      records.find(r => r.billing_period === currentYear) ??
      // 없으면 가장 최근 연도의 청구
      records.slice().sort((a, b) => b.billing_period.localeCompare(a.billing_period))[0] ??
      null
    )
  }
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return (
    records.find(r => r.billing_period === currentPeriod) ??
    records.slice().sort((a, b) => b.billing_period.localeCompare(a.billing_period))[0] ??
    null
  )
}

export function BillingSummary({ customerId, customerType, billingCycle, paymentMethod }: Props) {
  const [records, setRecords] = useState<BillingRecord[]>([])
  const [loading, setLoading] = useState(true)

  const isAnnual = customerType === '정기딥케어' && billingCycle === '연간'
  const isEndCare = customerType === '정기엔드케어'

  const fetch_ = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/billings?customer_id=${customerId}`)
      const data = await res.json()
      setRecords((data.billings ?? []) as BillingRecord[])
    } catch {
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => { fetch_() }, [fetch_])

  if (!isAnnual && !isEndCare) return null

  const target = pickTargetRecord(records, isAnnual)
  const periodLabel = isAnnual
    ? (target ? `${target.billing_period}년` : '연간')
    : (target ? `${target.billing_period}` : '최근 월')

  return (
    <div className="border border-border-subtle rounded-xl overflow-hidden bg-surface">
      <div className="px-4 py-2 bg-surface-sunken border-b border-border-subtle flex items-center justify-between">
        <p className="text-xs font-semibold text-text-secondary">
          {isAnnual ? '연간 결제 요약' : '월간 결제 요약'} · {periodLabel}
        </p>
        {target && (
          <div className="flex items-center gap-1">
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                target.status === 'paid'
                  ? 'bg-emerald-100 text-emerald-700'
                  : target.status === 'overdue'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-yellow-100 text-yellow-700'
              }`}
            >
              {target.status === 'paid' ? '결제완료' : target.status === 'overdue' ? '연체' : '미결제'}
            </span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                target.tax_invoice_issued
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-surface text-text-tertiary border border-border'
              }`}
            >
              {target.tax_invoice_issued ? '계산서완료' : '계산서 미발행'}
            </span>
          </div>
        )}
      </div>
      <div className="px-4 py-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {loading ? (
          <span className="text-text-tertiary">불러오는 중...</span>
        ) : !target ? (
          <span className="text-text-tertiary">해당 기간 청구 이력이 없습니다.</span>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <span className="text-text-tertiary">최근 결제일</span>
              <span className={`font-semibold ${target.paid_date ? 'text-emerald-700' : 'text-text-tertiary'}`}>
                {fmtDate(target.paid_date) || '-'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-text-tertiary">결제 방식</span>
              <span className="font-semibold text-text-primary">{paymentMethod || '-'}</span>
            </div>
            {target.tax_invoice_issued_date && (
              <div className="flex items-center gap-1.5">
                <span className="text-text-tertiary">계산서 발행일</span>
                <span className="font-semibold text-blue-700">{fmtDate(target.tax_invoice_issued_date)}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
