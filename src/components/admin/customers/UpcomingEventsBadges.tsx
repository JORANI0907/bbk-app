'use client'

import { useEffect, useState } from 'react'

/**
 * 리스트 뷰 "방문일정" / "결제상태요약" 보강용 (2026-10-19)
 *
 * UpcomingVisits   : 다음 방문 2건 (오늘 이후)
 * UpcomingBillings : 정기결제 등록 여부 + 결제 이력 타임라인
 *   2026-11-03: "예정 2건 / 완료 2건" 두 덩어리 → 한 줄기 타임라인으로 통합.
 *     최근 결제완료 1건 + 그 이전 완료 2건 + 다음 예정 1건을 날짜순으로 보여주고,
 *     줄마다 결제 완료 여부·계산서 발행 여부를 표시한다.
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

/** 타임라인 구성: 완료 이력 3건(최근 1 + 이전 2) + 예정 1건 */
const PAST_ROWS = 3
const FUTURE_ROWS = 1

function fmtMD(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`
}

/** 청구 기간 라벨: '2026-10' → '10월', '2026' → '2026년', '2026-10-24'(건별) → '10/24분' */
function periodLabel(period: string): string {
  if (/^\d{4}-\d{2}$/.test(period)) return `${parseInt(period.slice(5, 7), 10)}월`
  if (/^\d{4}$/.test(period)) return `${period}년`
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return `${fmtMD(period)}분`
  return period
}

/** 2026-10-19: 영어 enum 결제수단 코드를 사장님 UI 용 한국어 라벨로 */
export const PAYMENT_METHOD_LABEL: Record<string, string> = {
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
export function paymentMethodLabel(method: string | null): string {
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

/** 타임라인 한 줄 — 완료(paid) 또는 예정(pending) */
interface TimelineRow {
  id: string
  kind: 'paid' | 'due' | 'overdue'
  period: string
  date: string
  amount: number
  method: string | null
  invoiced: boolean | null
}

function buildTimeline(data: UpcomingEventsResp | null, today: string): TimelineRow[] {
  if (!data) return []
  // 완료 이력: API 는 최근순(desc) → 최근 1 + 이전 2 를 잘라 오래된 순으로 뒤집는다
  const past: TimelineRow[] = (data.past_billings ?? []).slice(0, PAST_ROWS).reverse().map(b => ({
    id: b.id, kind: 'paid', period: b.billing_period,
    date: b.paid_date ?? b.due_date, amount: b.amount,
    method: b.payment_method_snapshot, invoiced: b.tax_invoice_issued,
  }))
  // 예정: 가장 가까운 미결제 1건 (결제일이 지났으면 연체 표시)
  const future: TimelineRow[] = (data.billings ?? []).slice(0, FUTURE_ROWS).map(b => ({
    id: b.id, kind: b.due_date < today ? 'overdue' : 'due', period: b.billing_period,
    date: b.due_date, amount: b.amount, method: null, invoiced: null,
  }))
  return [...past, ...future]
}

function TimelineLine({ row }: { row: TimelineRow }) {
  const icon = row.kind === 'paid' ? '✅' : row.kind === 'overdue' ? '⚠️' : '💰'
  const tone = row.kind === 'paid' ? 'text-emerald-700' : row.kind === 'overdue' ? 'text-state-danger' : 'text-amber-700'
  const statusLabel = row.kind === 'paid' ? '결제완료' : row.kind === 'overdue' ? '미결제(기한 지남)' : '결제예정'
  return (
    <span className={`text-[11px] font-medium leading-tight ${tone}`}>
      {icon} {periodLabel(row.period)}
      <span className="ml-1 text-text-tertiary font-normal">{fmtMD(row.date)}</span>
      <span className="ml-1 text-text-primary">{row.amount.toLocaleString('ko-KR')}원</span>
      <span className="ml-1 text-[10px] font-normal">· {statusLabel}</span>
      {row.method && (
        <span className="ml-1 text-[10px] text-text-tertiary font-normal">· {paymentMethodLabel(row.method)}</span>
      )}
      {row.kind === 'paid' && (
        <span className={`ml-1 text-[10px] font-normal ${row.invoiced ? 'text-emerald-600' : 'text-text-tertiary'}`}>
          · {row.invoiced ? '📄 계산서발행' : '⏳ 계산서미발행'}
        </span>
      )}
    </span>
  )
}

interface BillingsProps {
  customerId: string
  customerType: string | null
  paymentMethod: string | null
}
export function UpcomingBillings({ customerId, customerType, paymentMethod }: BillingsProps) {
  const { data } = useUpcomingEvents(customerId)
  const autoActive = data?.billing_key_active ?? false
  // 2026-11-01: 정기딥도 자동결제 카드 등록 가능 → 뱃지 공통 노출
  const isRegular = customerType === '정기엔드케어' || customerType === '정기딥케어'
  const today = new Date().toISOString().slice(0, 10)
  const rows = buildTimeline(data, today)

  return (
    <div className="flex flex-col gap-1 text-xs">
      {/* 상단: 정기결제 등록 여부 + 결제수단 (정기엔드/정기딥 모두 결제수단 노출) */}
      <div className="flex items-center gap-1 flex-wrap">
        {isRegular && (
          autoActive ? (
            <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded font-semibold">
              🔄 정기결제 등록
            </span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">
              ⏳ 정기결제 미등록
            </span>
          )
        )}
        <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-medium">
          💳 {paymentMethodLabel(paymentMethod)}
        </span>
      </div>
      {/* 하단: 결제 이력 타임라인 — 완료 3건(오래된 순) 다음 예정 1건 */}
      {rows.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          {rows.map(row => <TimelineLine key={row.id} row={row} />)}
        </div>
      ) : (
        <span className="text-[11px] text-text-tertiary">결제 이력 없음</span>
      )}
    </div>
  )
}
