'use client'

import { useEffect, useState } from 'react'

/**
 * 리스트 뷰 "방문일정" / "결제상태요약" 보강용 (2026-10-19)
 *
 * UpcomingVisits   : 다음 방문 2건 (오늘 이후)
 * UpcomingBillings : 자동결제 여부 + 다음 결제 2건 (pending)
 *
 * 각 컴포넌트가 lazy fetch (/api/admin/customers/[id]/upcoming-events).
 * 같은 행에서 2번 호출되지만 응답이 가볍고 Supabase 캐시 활용으로 수용 가능.
 */

interface Visit { id: string; construction_date: string; progress_status: string | null }
interface Billing { id: string; due_date: string; amount: number; billing_period: string }
interface PastBilling {
  id: string
  due_date: string
  paid_date: string | null
  amount: number
  billing_period: string
  status: string
  tax_invoice_issued: boolean | null
  payment_method_snapshot: string | null
}
interface UpcomingEventsResp {
  visits: Visit[]
  billings: Billing[]
  past_billings?: PastBilling[]
  billing_key_active: boolean
  payment_method?: string | null
}

function fmtMD(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`
}

/** 2026-10-19: 영어 enum 결제수단 코드를 사장님 UI 용 한국어 라벨로 */
const PAYMENT_METHOD_LABEL: Record<string, string> = {
  credit_card:      '카드결제',
  corporate_card:   '법인카드',
  cash:             '현금결제',
  cash_untaxed:     '현금(비과세)',
  bank_transfer:    '계좌이체',
  account_transfer: '계좌이체',
  virtual_account:  '가상계좌',
  platform:         '플랫폼',
  easy_pay:         '간편결제',
  tax_invoice:      '세금계산서',
  escrow:           '에스크로',
  mobile:           '휴대폰결제',
}
function paymentMethodLabel(method: string | null): string {
  if (!method) return '수동결제'
  return PAYMENT_METHOD_LABEL[method] ?? method
}

/** 공통 fetch 훅 — 동일 customerId 는 세션 내에서 한 번만 fetch 하도록 메모 */
const cache = new Map<string, Promise<UpcomingEventsResp>>()
function useUpcomingEvents(customerId: string): { data: UpcomingEventsResp | null; loading: boolean } {
  const [data, setData] = useState<UpcomingEventsResp | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let aborted = false
    if (!cache.has(customerId)) {
      cache.set(customerId, fetch(`/api/admin/customers/${customerId}/upcoming-events`).then(r => r.json()))
    }
    cache.get(customerId)!
      .then(d => { if (!aborted) { setData(d); setLoading(false) } })
      .catch(() => { if (!aborted) setLoading(false) })
    return () => { aborted = true }
  }, [customerId])

  return { data, loading }
}

interface VisitsProps {
  customerId: string
  fallbackText?: string | null
}
export function UpcomingVisits({ customerId, fallbackText }: VisitsProps) {
  const { data } = useUpcomingEvents(customerId)
  const visits = (data?.visits ?? []).slice(0, 2)

  return (
    <div className="flex flex-col gap-0.5 text-xs">
      {fallbackText && (
        <span className="text-text-secondary">{fallbackText}</span>
      )}
      {visits.length > 0 ? (
        <div className="flex flex-col gap-0.5 mt-0.5">
          {visits.map(v => (
            <span key={v.id} className="text-[11px] text-brand-700 font-medium">
              📅 {fmtMD(v.construction_date)}
              {v.progress_status && (
                <span className="ml-1 text-text-tertiary font-normal">· {v.progress_status}</span>
              )}
            </span>
          ))}
        </div>
      ) : (
        !fallbackText && <span className="text-text-tertiary">-</span>
      )}
    </div>
  )
}

interface BillingsProps {
  customerId: string
  customerType: string | null
  paymentMethod: string | null
}
export function UpcomingBillings({ customerId, customerType, paymentMethod }: BillingsProps) {
  const { data } = useUpcomingEvents(customerId)
  const billings = (data?.billings ?? []).slice(0, 2)
  const pastBillings = (data?.past_billings ?? []).slice(0, 2)
  const autoActive = data?.billing_key_active ?? false
  const isEndCare = customerType === '정기엔드케어'

  return (
    <div className="flex flex-col gap-1 text-xs">
      {/* 상단: 자동결제 뱃지 + 결제수단 (정기엔드/정기딥 모두 결제수단 노출) */}
      <div className="flex items-center gap-1 flex-wrap">
        {isEndCare && (
          autoActive ? (
            <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded font-semibold">
              🔄 자동결제 활성
            </span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">
              ⏳ 빌링키 미등록
            </span>
          )
        )}
        <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-medium">
          💳 {paymentMethodLabel(paymentMethod)}
        </span>
      </div>
      {/* 중단: 다음 결제 2건 (예정) */}
      {billings.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          {billings.map(b => (
            <span key={b.id} className="text-[11px] text-amber-700 font-medium">
              💰 {fmtMD(b.due_date)}
              <span className="ml-1 text-text-primary">{b.amount.toLocaleString('ko-KR')}원</span>
            </span>
          ))}
        </div>
      ) : (
        <span className="text-[11px] text-text-tertiary">예정 없음</span>
      )}
      {/* 하단: 과거 결제 2건 (완료 · 계산서 · 결제방법) — 2026-10-24 추가 */}
      {pastBillings.length > 0 && (
        <div className="flex flex-col gap-0.5 pt-1 border-t border-border-subtle/60">
          {pastBillings.map(b => {
            const invoiced = b.tax_invoice_issued === true
            const dateLabel = b.paid_date
              ? fmtMD(b.paid_date)
              : b.due_date
                ? fmtMD(b.due_date)
                : '-'
            const methodLabel = b.payment_method_snapshot
              ? paymentMethodLabel(b.payment_method_snapshot)
              : null
            return (
              <span key={b.id} className="text-[11px] text-emerald-700 font-medium leading-tight">
                ✅ {dateLabel}
                <span className="ml-1 text-text-primary">{b.amount.toLocaleString('ko-KR')}원</span>
                {methodLabel && (
                  <span className="ml-1 text-[10px] text-text-tertiary font-normal">· {methodLabel}</span>
                )}
                <span className={`ml-1 text-[10px] font-normal ${invoiced ? 'text-emerald-600' : 'text-text-tertiary'}`}>
                  · {invoiced ? '📄 계산서발행' : '⏳ 계산서미발행'}
                </span>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
