'use client'

/**
 * 결제 안내 자동 발송 예정 미리보기 (2026-10-18 Phase I.2)
 *
 * 정기엔드 (선불): payment_date 기준 다음 3개월 due_date → 각각 5일전/3일전/당일/격일 연체 리듬 미리보기
 * 정기딥   (후불): 월 작업 완료 기반 — 예측 불가. 발송 규칙만 안내.
 *
 * 사장님이 계약 정보 (결제 주기·결제일자) 변경 즉시 미리보기가 갱신됨 → 설정 효과 즉시 체감.
 */

import { Clock } from 'lucide-react'

interface Props {
  customerType: '정기딥케어' | '정기엔드케어'
  billingCycle: string | null       // '월간' | '연간' | '1개월' 등 자유 문자열
  paymentDate: number | null        // 매월 N일 (1~31)
  billingStartDate: string | null
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

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
  // 이번 달의 payment_date 가 아직 안 지났으면 이번 달부터, 지났으면 다음 달부터
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

interface SendPlan { date: string; label: string }

/** 하나의 due_date 에 대한 발송 리듬 5~6개 */
function buildSendPlan(dueIso: string): SendPlan[] {
  return [
    { date: addDays(dueIso, -5), label: '5일 전' },
    { date: addDays(dueIso, -3), label: '3일 전' },
    { date: dueIso,              label: '당일' },
    { date: addDays(dueIso, 2),  label: '연체 1차 (+2일)' },
    { date: addDays(dueIso, 4),  label: '연체 2차 (+4일)' },
    { date: addDays(dueIso, 6),  label: '연체 3차 (+6일)' },
  ]
}

export function BillingAutoScheduleSummary({
  customerType, billingCycle, paymentDate, billingStartDate,
}: Props) {
  void billingCycle; void billingStartDate  // 추후 로직 확장용

  // 정기딥 (후불): 예측 불가 — 규칙만
  if (customerType === '정기딥케어') {
    return (
      <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
        <p className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
          <Clock size={12} /> 결제 안내 자동 발송 규칙 (정기딥 · 후불)
        </p>
        <ul className="mt-2 space-y-1 text-[11px] text-emerald-700 leading-relaxed pl-5 list-disc">
          <li>월 작업 <strong>전부 완료</strong> 되면 결제 자동 생성</li>
          <li>결제 기한 = 마지막 작업 완료일 <strong>+7일</strong></li>
          <li>기한 지난 뒤 <strong>격일</strong>로 자동 발송 (최대 7회, 2주)</li>
          <li>결제 완료 시 발송 즉시 중단, 2주 지나면 Slack 알림 + 자동 중단</li>
        </ul>
        <p className="mt-2 text-[10px] text-emerald-600 border-t border-emerald-200 pt-1.5">
          💡 cron 매일 아침 9시 KST 자동 실행
        </p>
      </div>
    )
  }

  // 정기엔드 (선불): payment_date 기반 미리보기
  if (!paymentDate || paymentDate < 1 || paymentDate > 31) {
    return (
      <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
        <p className="text-xs font-semibold text-amber-800">
          ⚠️ <strong>결제일자</strong>를 1~31일 범위로 입력하면 자동 발송 예정 일정이 여기 표시됩니다.
        </p>
      </div>
    )
  }

  const dueDates = nextDueDates(paymentDate, 2)  // 다음 2개월
  const todayStr = new Date().toISOString().slice(0, 10)

  return (
    <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
      <p className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
        <Clock size={12} /> 결제 안내 자동 발송 예정 (정기엔드 · 선불 · 매월 {paymentDate}일 결제)
      </p>
      <div className="mt-2 space-y-2.5">
        {dueDates.map(due => {
          const plan = buildSendPlan(due)
          return (
            <div key={due} className="bg-white rounded-md border border-emerald-100 p-2">
              <p className="text-[11px] font-semibold text-emerald-700 mb-1.5">
                📅 {fmtMD(due)} 결제 기한
              </p>
              <ul className="space-y-0.5 text-[11px] text-text-primary">
                {plan.map(s => {
                  const isPast = s.date < todayStr
                  return (
                    <li key={s.date} className={`flex items-center gap-1.5 ${isPast ? 'text-text-tertiary line-through' : ''}`}>
                      <span className="text-emerald-500">⏱️</span>
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
      <p className="mt-2 text-[10px] text-emerald-600 border-t border-emerald-200 pt-1.5">
        💡 cron 매일 아침 9시 KST 자동 실행 · 결제 완료 시 즉시 중단 · 지난 날짜는 취소선 표시
      </p>
    </div>
  )
}
