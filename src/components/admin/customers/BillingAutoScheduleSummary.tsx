'use client'

/**
 * 결제 안내 자동 발송 예정 미리보기 (2026-10-19 Phase D 재작성)
 *
 * 공통:
 *   - 파란색(sky) 통일
 *   - 기본 접힘 → 헤더 클릭 시 펼침
 *   - 발송 리듬: D-3 + 당일 2회 (Phase D 단순화 규칙)
 *
 * 정기엔드 (선불): payment_date 기준 다음 2개월 due_date 미리보기
 * 정기딥   (후불): service_billings 의 pending 레코드 → 가까운 due_date 2개
 */

import { Clock, ChevronDown, ChevronUp } from 'lucide-react'
import { useEffect, useState } from 'react'

interface Props {
  customerType: '정기딥케어' | '정기엔드케어'
  billingCycle: string | null       // '월간' | '연간' | '1개월' 등 자유 문자열
  paymentDate: number | null        // 매월 N일 (1~31)
  billingStartDate: string | null
  // 2026-10-19: 정기딥 pending billings 조회용
  customerId?: string | null
}

function pad(n: number): string { return String(n).padStart(2, '0') }
function lastDayOfMonth(y: number, m: number): number { return new Date(y, m, 0).getDate() }

function fmtMD(iso: string): string {
  const [, m, d] = iso.split('-')
  const dow = ['일', '월', '화', '수', '목', '금', '토'][new Date(iso).getDay()]
  return `${parseInt(m, 10)}/${parseInt(d, 10)} (${dow})`
}

function addDays(iso: string, delta: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + delta)
  return d.toISOString().slice(0, 10)
}

/** 다음 N개월의 due_date (payment_date 일자, 월말 넘침 안전 처리) */
function nextDueDates(paymentDate: number, months: number): string[] {
  const result: string[] = []
  const now = new Date()
  let y = now.getFullYear()
  let m = now.getMonth() + 1
  if (now.getDate() > paymentDate) {
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  for (let i = 0; i < months; i++) {
    const safeDay = Math.min(paymentDate, lastDayOfMonth(y, m))
    result.push(`${y}-${pad(m)}-${pad(safeDay)}`)
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return result
}

/** 2026-10-19 Phase D 발송 리듬: D-3 + 당일 2회 */
interface SendPlan { date: string; label: string }
function buildSendPlan(dueIso: string): SendPlan[] {
  return [
    { date: addDays(dueIso, -3), label: '3일 전' },
    { date: dueIso,              label: '당일' },
  ]
}

export function BillingAutoScheduleSummary({
  customerType, billingCycle, paymentDate, billingStartDate, customerId,
}: Props) {
  void billingCycle; void billingStartDate
  const [open, setOpen] = useState(false)
  const [deepDueDates, setDeepDueDates] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  // 정기딥 전용: pending service_billings 조회 (헤더 펼칠 때만 fetch)
  useEffect(() => {
    if (!open || customerType !== '정기딥케어' || !customerId) return
    let aborted = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/customers/${customerId}/billings/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
        const data = await res.json() as { schedule?: Array<{ due_date: string; existing_status: string | null }> }
        if (aborted) return
        const pending = (data.schedule ?? [])
          .filter(s => s.existing_status === null || s.existing_status === 'pending')
          .map(s => s.due_date)
          .sort()
          .slice(0, 2)
        setDeepDueDates(pending)
      } catch {
        if (!aborted) setDeepDueDates([])
      } finally {
        if (!aborted) setLoading(false)
      }
    })()
    return () => { aborted = true }
  }, [open, customerType, customerId])

  // 정기엔드: payment_date 체크
  const endDueDates = (customerType === '정기엔드케어' && paymentDate && paymentDate >= 1 && paymentDate <= 31)
    ? nextDueDates(paymentDate, 2)
    : []

  const dueDates = customerType === '정기딥케어' ? deepDueDates : endDueDates
  const todayStr = new Date().toISOString().slice(0, 10)

  const headerLabel = customerType === '정기딥케어'
    ? '결제 안내 자동 발송 예정 (정기딥 · 후불)'
    : paymentDate
      ? `결제 안내 자동 발송 예정 (정기엔드 · 선불 · 매월 ${paymentDate}일)`
      : '결제 안내 자동 발송 예정 (정기엔드 · 선불)'

  return (
    <div className="rounded-lg bg-sky-50 border border-sky-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-sky-100 transition-colors text-left"
      >
        <p className="text-xs font-bold text-sky-800 flex items-center gap-1.5 break-keep">
          <Clock size={12} /> {headerLabel}
        </p>
        {open
          ? <ChevronUp size={14} className="text-sky-700 shrink-0" />
          : <ChevronDown size={14} className="text-sky-700 shrink-0" />}
      </button>

      {open && (
        <div className="px-3 pb-3 border-t border-sky-200">
          {/* 정기엔드: payment_date 미설정 안내 */}
          {customerType === '정기엔드케어' && (!paymentDate || paymentDate < 1 || paymentDate > 31) && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mt-2">
              ⚠️ 결제일자(1~31)를 입력하면 자동 발송 예정 일정이 여기 표시됩니다.
            </p>
          )}

          {/* 정기딥: 로딩 */}
          {customerType === '정기딥케어' && loading && (
            <p className="text-[11px] text-sky-700 mt-2">예정 일정 불러오는 중…</p>
          )}

          {/* 정기딥: 비어있음 */}
          {customerType === '정기딥케어' && !loading && dueDates.length === 0 && (
            <p className="text-[11px] text-sky-700 mt-2 break-keep">
              아직 예정된 결제청구가 없습니다. 위 [결제청구 생성] 버튼으로 청구를 만들면 여기에 발송 예정 일정이 표시됩니다.
            </p>
          )}

          {/* 공통: 예정 일정 리스트 */}
          {dueDates.length > 0 && (
            <div className="mt-2 space-y-2.5">
              {dueDates.map(due => {
                const plan = buildSendPlan(due)
                return (
                  <div key={due} className="bg-white rounded-md border border-sky-100 p-2">
                    <p className="text-[11px] font-semibold text-sky-700 mb-1.5">
                      📅 {fmtMD(due)} 결제 기한
                    </p>
                    <ul className="space-y-0.5 text-[11px] text-text-primary">
                      {plan.map(s => {
                        const isPast = s.date < todayStr
                        return (
                          <li key={s.date} className={`flex items-center gap-1.5 ${isPast ? 'text-text-tertiary line-through' : ''}`}>
                            <span className="text-sky-500">⏱️</span>
                            <span className="font-mono">{fmtMD(s.date)}</span>
                            <span className="text-text-tertiary text-[10px]">· {s.label}</span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}

          <p className="mt-2 text-[10px] text-sky-600 border-t border-sky-200 pt-1.5 break-keep">
            💡 매일 아침 9시 KST 자동 실행 · D-3 + 당일 2회 발송 · 결제 완료 시 즉시 중단
          </p>
        </div>
      )}
    </div>
  )
}
