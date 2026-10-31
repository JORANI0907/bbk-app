'use client'

/**
 * 결제 안내 자동 발송 예정 — "이렇게 설정하면 이렇게 결제·안내됩니다" 설명 카드
 *   2026-10-19 Phase D: D-3 + 당일 2회 (실제 발송과 불일치)
 *   2026-11-01 개편 1차: 실제 청구서의 notify_start_date 표시
 *   2026-11-01 개편 2차 (사장님 지시): 실제 청구서가 아니라, 지금 화면에서 고른
 *     결제주기 · 결제 방식 · 결제일자 · 계약기간 그대로면 어떻게 되는지 쉬운 한국말 예시로 보여준다.
 *     계산은 실제 청구서 생성기(billing-generator)와 발송 규칙(billing-notify-policy)을 그대로 쓴다.
 */

import { Clock, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { generateBillingSchedule, billingCycleStepMonths } from '@/lib/billing-generator'
import {
  planSendDates, computeNotifyStartDate, billingModeLabel, fromBillingMode, todayKstIso, addDaysIso,
  type BillingMode,
} from '@/lib/billing-notify-policy'

interface Props {
  customerType: '정기딥케어' | '정기엔드케어'
  billingMode: BillingMode
  billingCycle: string | null        // '월간' | 'N개월' | '연간'
  paymentDate: number | null         // 1~31, 비우면 계약 시작일의 일
  contractStartDate: string | null   // YYYY-MM-DD
  contractEndDate: string | null
}

function fmtKo(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${y}년 ${parseInt(m, 10)}월 ${parseInt(d, 10)}일`
}

function fmtShort(iso: string): string {
  const [, m, d] = iso.split('-')
  const dow = ['일', '월', '화', '수', '목', '금', '토'][new Date(`${iso}T00:00:00`).getDay()]
  return `${parseInt(m, 10)}/${parseInt(d, 10)}(${dow})`
}

function cycleKo(cycle: string | null): string {
  const n = billingCycleStepMonths(cycle)
  return n === 12 ? '12개월(1년)' : `${n}개월`
}

/**
 * 첫 결제일 + 앞으로 올 결제일 3개.
 * 첫 결제일을 따로 보여주는 이유: 1개월 주기는 선납(주기 시작)과 후납(주기 끝)의 차이가 딱 한 주기라,
 * 오늘 이후 날짜만 보면 둘이 똑같아 보인다. 첫 결제일을 보면 차이가 바로 드러난다.
 */
function scheduleDueDates(p: Props): { first: string | null; upcoming: string[] } {
  if (!p.contractStartDate) return { first: null, upcoming: [] }
  const { timing } = fromBillingMode(p.billingMode)
  const today = todayKstIso()
  const rows = generateBillingSchedule({
    serviceType: p.customerType,
    billingCycle: p.billingCycle ?? '월간',
    contractStartDate: p.contractStartDate,
    contractEndDate: p.contractEndDate,
    paymentDay: p.paymentDate,
    billingAmount: 1,               // 금액은 예시 계산에 영향 없음 (0 이면 생성기가 빈 배열을 돌려주므로 1)
    billingTiming: timing,
  })
  const all = rows.map(r => r.due_date)
  return { first: all[0] ?? null, upcoming: all.filter(d => d >= today).slice(0, 3) }
}

export function BillingAutoScheduleSummary(props: Props) {
  const { customerType, billingMode, billingCycle, paymentDate, contractStartDate } = props
  const [open, setOpen] = useState(false)
  const typeShort = customerType === '정기딥케어' ? '정기딥' : '정기엔드'
  const isPerVisit = billingMode === 'per_visit_postpaid'
  const isAnnual = billingCycleStepMonths(billingCycle) === 12 && !isPerVisit
  const { trigger, timing } = fromBillingMode(billingMode)
  const startDay = contractStartDate ? parseInt(contractStartDate.slice(8, 10), 10) : null
  const effectiveDay = paymentDate ?? startDay
  const dayNote = paymentDate ? `${paymentDate}일` : (startDay ? `${startDay}일 (계약 시작일 기준)` : '계약 시작일의 일자')

  const headerLabel = `결제 안내 자동 발송 예정 (${typeShort} · ${isPerVisit ? '' : `${cycleKo(billingCycle)}마다 · `}${billingModeLabel(billingMode)})`

  // ── 쉬운 말 설명 ───────────────────────────────────────────
  let summaryLine: string
  if (isPerVisit) {
    summaryLine = '시공 1건이 "작업완료"로 처리되는 순간 그 건의 청구서가 만들어지고, 바로 결제 안내가 나갑니다. 결제주기·결제일자는 쓰지 않습니다.'
  } else if (isAnnual) {
    summaryLine = timing === 'prepaid'
      ? `계약 시작일에 1년치를 한 번에 결제합니다. 고객에게 자동 문자는 가지 않고, 다음 결제일이 되면 관리자에게 재계약 안내만 갑니다.`
      : `1년 서비스가 끝난 뒤 다음 ${dayNote}에 결제합니다. 고객에게 자동 문자는 가지 않고, 결제일이 되면 관리자에게 재계약 안내만 갑니다.`
  } else if (timing === 'prepaid') {
    summaryLine = `${cycleKo(billingCycle)}마다 서비스를 받기 전에 결제합니다. 주기 시작일인 결제일자 ${dayNote} 당일에 1차 결제 안내가 나가고, 미납이면 3일 뒤·7일 뒤에 한 번씩 더 나갑니다(최대 3회). 결제되면 바로 멈춥니다.`
  } else {
    summaryLine = `${cycleKo(billingCycle)} 서비스를 받은 뒤에 결제합니다. 주기가 끝난 다음 결제일자 ${dayNote} 당일에 1차 결제 안내가 나가고, 미납이면 3일 뒤·7일 뒤에 한 번씩 더 나갑니다(최대 3회). 결제되면 바로 멈춥니다.`
  }

  // ── 예시 날짜 ───────────────────────────────────────────────
  const examples: Array<{ title: string; sends: Array<{ date: string; label: string }> }> = []
  if (isPerVisit) {
    const ex = addDaysIso(todayKstIso(), 4)
    examples.push({
      title: `예) ${fmtKo(ex)} 시공 건을 작업완료 처리하면`,
      sends: planSendDates(ex),
    })
  } else if (!isAnnual && contractStartDate) {
    const { first, upcoming } = scheduleDueDates(props)
    const today = todayKstIso()
    const list = first && !upcoming.includes(first) ? [first, ...upcoming] : upcoming
    list.forEach((due) => {
      const start = computeNotifyStartDate({ trigger, timing, dueDate: due })
      if (!start) return
      const isFirst = due === first
      const past = due < today
      const title = `${isFirst ? '첫 결제일 ' : ''}${fmtKo(due)} 결제${past ? ' · 지남' : ''}`
      examples.push({ title, sends: planSendDates(start) })
    })
  }

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
        {open ? <ChevronUp size={14} className="text-sky-700 shrink-0" /> : <ChevronDown size={14} className="text-sky-700 shrink-0" />}
      </button>

      {open && (
        <div className="px-3 pb-3 border-t border-sky-200 space-y-2">
          <p className="text-[11px] text-sky-900 mt-2 leading-relaxed break-keep">📌 {summaryLine}</p>

          {!isPerVisit && !contractStartDate && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 break-keep">
              ⚠️ 계약 시작일을 입력하면 실제 날짜로 예시가 표시됩니다.
            </p>
          )}

          {!isPerVisit && !isAnnual && !paymentDate && startDay && (
            <p className="text-[11px] text-sky-700 break-keep">
              결제일자가 비어 있어 계약 시작일의 일자(<strong>{effectiveDay}일</strong>)로 결제합니다.
            </p>
          )}

          {examples.length > 0 && (
            <div className="space-y-2">
              {examples.map(ex => (
                <div key={ex.title} className="bg-white rounded-md border border-sky-100 p-2">
                  <p className="text-[11px] font-semibold text-sky-700 mb-1">📅 {ex.title}</p>
                  <p className="text-[11px] text-text-primary break-keep">
                    {ex.sends.map((s, i) => (
                      <span key={s.date}>
                        {i > 0 && <span className="text-text-tertiary"> → </span>}
                        <span className="font-mono">{fmtShort(s.date)}</span>
                        <span className="text-text-tertiary"> {s.label.replace(/\s*\(.*\)$/, '')}</span>
                      </span>
                    ))}
                    <span className="text-text-tertiary"> 안내</span>
                  </p>
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] text-sky-600 border-t border-sky-200 pt-1.5 break-keep">
            💡 저장하면 이 규칙대로 청구서가 만들어지고, 매일 아침 9시 10분에 결제 링크를 담아 자동 발송됩니다 · 결제 완료 시 즉시 중단 · 자동결제 카드 등록 고객은 문자 대신 결제일에 바로 결제
          </p>
        </div>
      )}
    </div>
  )
}
