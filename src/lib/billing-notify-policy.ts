/**
 * 정기 결제 안내 발송 규칙 (2026-11-01 개편)
 *
 * 규칙은 "고객 유형(딥/엔드)"이 아니라 두 축으로 정한다.
 *   ① 결제 기준 billing_trigger : per_visit(시공 1건마다) / monthly_date / monthly_last / yearly
 *   ② 결제 시점 billing_timing  : prepaid(서비스 전) / postpaid(서비스 후)
 *
 * 발송은 청구서(service_billings) 1장 기준.
 *   notify_start_date(= 결제일자, 건별은 작업완료일) 당일 → 3일 뒤 → 7일 뒤, 최대 3회.
 *   선납/후납은 '결제일자가 주기 시작에 오느냐, 주기 끝에 오느냐'만 다르고 안내 시점 규칙은 같다 (2026-11-01 사장님 확정).
 *   결제 완료(status=paid) 되면 즉시 중단. 3회 뒤에도 미납이면 관리자 수동 대응.
 *
 * 이 파일은 DB·네트워크를 전혀 모르는 순수 함수만 둔다 (단위 테스트 대상).
 */

export type BillingTrigger = 'per_visit' | 'monthly_date' | 'monthly_last' | 'yearly'
export type BillingTiming = 'prepaid' | 'postpaid'

/** 발송 회차별 기준일 오프셋(일). 1회차 당일, 2회차 3일 뒤, 3회차 7일 뒤 */
export const NOTIFY_OFFSETS_DAYS = [0, 3, 7] as const
export const MAX_NOTIFY_ATTEMPTS = NOTIFY_OFFSETS_DAYS.length

const DAY_MS = 24 * 60 * 60 * 1000

export function addDaysIso(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

/** 두 날짜(YYYY-MM-DD) 차이: b - a (일) */
export function diffDaysIso(a: string, b: string): number {
  const ta = new Date(`${a}T00:00:00Z`).getTime()
  const tb = new Date(`${b}T00:00:00Z`).getTime()
  return Math.round((tb - ta) / DAY_MS)
}

/** 오늘 날짜를 한국 시간 기준 YYYY-MM-DD 로 */
export function todayKstIso(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * 세계표준시로 저장된 시각(ISO)을 한국 날짜(YYYY-MM-DD)로.
 * 과거 코드가 한국 시각 문자열을 timestamptz 에 넣어 DB가 UTC로 돌려주면
 * 앞 10글자만 자르는 비교가 하루 어긋나던 버그의 재발 방지용.
 */
export function isoToKstDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return new Date(t + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export interface NotifyStartInput {
  trigger: BillingTrigger | null
  timing: BillingTiming | null
  /** 청구서 결제기한 (monthly_* 에서 사용) */
  dueDate: string | null
  /** 건별 선불: 시공 예정일 */
  constructionDate?: string | null
  /** 건별 후불: 작업완료 처리된 날짜 */
  workCompletedDate?: string | null
}

/**
 * 청구서의 알림 시작일 계산.
 *   per_visit + postpaid → 작업완료 당일 (즉시)
 *   per_visit + prepaid  → 시공일 당일
 *   결제주기(선납·후납 공통) → 결제일자(due_date) 당일
 *   yearly(레거시)        → null (고객 발송 없음, 관리자 재계약 안내만)
 *   trigger 미지정        → 결제주기 규칙으로 간주 (레거시 데이터 호환)
 */
export function computeNotifyStartDate(input: NotifyStartInput): string | null {
  const timing: BillingTiming = input.timing ?? 'prepaid'
  if (input.trigger === 'yearly') return null

  if (input.trigger === 'per_visit') {
    if (timing === 'postpaid') return input.workCompletedDate ?? null
    return input.constructionDate ?? null
  }

  return input.dueDate ?? null
}

export interface SendDecisionInput {
  todayIso: string
  notifyStartDate: string | null
  sendAttempts: number
  /** 마지막 발송 시각 (UTC ISO). 같은 날 중복 발송 방지 */
  lastNotifiedAt: string | null
}

export type SendDecision =
  | { send: true; attemptNo: number }
  | { send: false; reason: 'not_started' | 'not_due' | 'max_reached' | 'already_today' }

/**
 * 오늘 이 청구서를 보낼지 판정.
 *   k번째(0-based) 발송은 notify_start_date + NOTIFY_OFFSETS_DAYS[k] 이후 첫 실행에 나간다.
 *   하루 1회 제한. 3회 다 보냈으면 종료.
 */
export function decideSend(input: SendDecisionInput): SendDecision {
  if (!input.notifyStartDate) return { send: false, reason: 'not_started' }
  const attempts = Math.max(0, input.sendAttempts)
  if (attempts >= MAX_NOTIFY_ATTEMPTS) return { send: false, reason: 'max_reached' }

  const lastKst = isoToKstDate(input.lastNotifiedAt)
  if (lastKst === input.todayIso) return { send: false, reason: 'already_today' }

  const dueForThisAttempt = addDaysIso(input.notifyStartDate, NOTIFY_OFFSETS_DAYS[attempts])
  if (input.todayIso < dueForThisAttempt) return { send: false, reason: 'not_due' }

  return { send: true, attemptNo: attempts + 1 }
}

/** 화면 미리보기용: 알림 시작일 기준 3회 발송 예정일 */
export function planSendDates(notifyStartDate: string): Array<{ date: string; label: string }> {
  return [
    { date: addDaysIso(notifyStartDate, NOTIFY_OFFSETS_DAYS[0]), label: '1차 (당일)' },
    { date: addDaysIso(notifyStartDate, NOTIFY_OFFSETS_DAYS[1]), label: '2차 (3일 뒤)' },
    { date: addDaysIso(notifyStartDate, NOTIFY_OFFSETS_DAYS[2]), label: '3차 (7일 뒤)' },
  ]
}

/** 결제 기준 값 한글 라벨 */
export function triggerLabel(trigger: BillingTrigger | null | undefined, paymentDate?: number | null): string {
  switch (trigger) {
    case 'per_visit':    return '시공 1건마다'
    case 'monthly_last': return '매월 말일'
    case 'yearly':       return '연 1회'
    case 'monthly_date': return paymentDate ? `매월 ${paymentDate}일` : '매월 지정일'
    default:             return paymentDate ? `매월 ${paymentDate}일` : '결제 기준 미설정'
  }
}

/** 화면의 '결제 방식' 3종 (결제 기준 × 선불/후불을 합친 표현) */
export type BillingMode = 'cycle_prepaid' | 'cycle_postpaid' | 'per_visit_postpaid'

export function toBillingMode(trigger: BillingTrigger | null | undefined, timing: BillingTiming | null | undefined): BillingMode {
  if (trigger === 'per_visit') return 'per_visit_postpaid'
  return timing === 'postpaid' ? 'cycle_postpaid' : 'cycle_prepaid'
}

export function fromBillingMode(mode: BillingMode): { trigger: BillingTrigger; timing: BillingTiming } {
  if (mode === 'per_visit_postpaid') return { trigger: 'per_visit', timing: 'postpaid' }
  return { trigger: 'monthly_date', timing: mode === 'cycle_prepaid' ? 'prepaid' : 'postpaid' }
}

export function billingModeLabel(mode: BillingMode): string {
  if (mode === 'per_visit_postpaid') return '시공 건마다 후납'
  return mode === 'cycle_prepaid' ? '결제주기마다 선납' : '결제주기마다 후납'
}

export function timingLabel(timing: BillingTiming | null | undefined): string {
  return timing === 'postpaid' ? '후불' : '선불'
}
