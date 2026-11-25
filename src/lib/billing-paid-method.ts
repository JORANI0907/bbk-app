/**
 * 청구서(service_billings) 실제 결제수단·처리 경로 — 순수 함수 (2026-11-25)
 *
 *   payment_method_snapshot : 청구 생성 시 고객 마스터의 결제방식을 복사한 "예정 수단"
 *   paid_method             : 실제 결제수단 (완료될 때 기록)
 *   paid_via                : 처리 경로 — app_link(앱 결제창 자동 반영) | autopay(카드 자동결제) | manual(관리자 수동)
 *
 * 과거 완료 건은 두 칸 모두 비어 있다(대표 지시: 과거 기록은 빈칸).
 */
import { PAYMENT_METHOD_META, normalizePaymentMethod, type PaymentMethod } from '@/lib/payment-methods'

export type PaidVia = 'app_link' | 'autopay' | 'manual'
export const PAID_VIA_VALUES: readonly PaidVia[] = ['app_link', 'autopay', 'manual'] as const

export const PAID_VIA_LABEL: Record<PaidVia, string> = {
  app_link: '앱 결제창',
  autopay: '카드 자동결제',
  manual: '수동 처리',
}

/** 관리자가 수동 완료 때 고를 수 있는 수단 */
export const MANUAL_PAID_METHODS: readonly PaymentMethod[] = ['bank_transfer', 'credit_card', 'virtual_account', 'cash_untaxed'] as const

export function isPaidVia(v: unknown): v is PaidVia {
  return typeof v === 'string' && (PAID_VIA_VALUES as readonly string[]).includes(v)
}

/** 수단 코드 → 짧은 한글 라벨 (칩용) */
const SHORT_LABEL: Record<PaymentMethod, string> = {
  credit_card: '카드', bank_transfer: '계좌이체', virtual_account: '가상계좌', cash_untaxed: '비과세 현금', platform: '플랫폼',
}
export function paidMethodShortLabel(method: string | null | undefined): string | null {
  const m = normalizePaymentMethod(method)
  return m ? (SHORT_LABEL[m] ?? PAYMENT_METHOD_META[m].label) : null
}

export interface BillingMethodFields {
  status: string
  paid_method?: string | null
  paid_via?: string | null
  payment_method_snapshot?: string | null
}

export interface MethodChip {
  /** 칩 글자 */
  label: string
  /** 'actual' 실제 결제수단 | 'expected' 예정 수단 | 'unknown' 과거 건(미기록) */
  kind: 'actual' | 'expected' | 'unknown'
  /** 모달 안내용 긴 설명 */
  detail: string
}

/**
 * 결제이력 줄·모달에 보여 줄 수단 칩.
 *  - 완료: 실제 수단 + 경로. 카드 자동결제는 "카드 자동결제" 한 단어로.
 *  - 대기·지연: 예정 수단을 흐리게 ("예정: 가상계좌").
 *  - 완료인데 기록이 없으면(과거 건) null 을 돌려 칩을 그리지 않는다.
 */
export function billingMethodChip(b: BillingMethodFields): MethodChip | null {
  if (b.status === 'paid') {
    const via = isPaidVia(b.paid_via) ? b.paid_via : null
    const method = paidMethodShortLabel(b.paid_method)
    if (via === 'autopay') return { label: '카드 자동결제', kind: 'actual', detail: '등록된 카드로 자동 결제되었습니다.' }
    if (!method) return null
    if (via === 'app_link') return { label: `${method}(앱)`, kind: 'actual', detail: `앱 결제창에서 ${method}로 결제되어 자동 기록되었습니다.` }
    if (via === 'manual') return { label: `${method}(수동)`, kind: 'actual', detail: `관리자가 ${method}로 결제 완료 처리했습니다.` }
    return { label: method, kind: 'actual', detail: `${method}로 결제되었습니다.` }
  }
  const expected = paidMethodShortLabel(b.payment_method_snapshot)
  if (!expected) return null
  return { label: `예정: ${expected}`, kind: 'expected', detail: `고객 정보의 결제방식(${expected})입니다. 완료 처리 때 바뀔 수 있습니다.` }
}

export interface ResolvePaidPatchInput {
  /** PATCH 로 들어온 값 (없으면 undefined) */
  status?: string
  paid_method?: string | null
  paid_via?: string | null
  /** 현재 행 */
  current: { status: string; paid_method: string | null; paid_via: string | null; payment_method_snapshot: string | null }
  /** 고객 마스터 결제방식 (예정 수단 스냅샷이 비었을 때 기본값) */
  customerMethod?: string | null
}

export type ResolvePaidPatchResult =
  | { ok: true; patch: { paid_method?: string | null; paid_via?: PaidVia | null } }
  | { ok: false; error: string }

/**
 * 관리자 수정(PATCH) 때 실제 수단·경로를 어떻게 저장할지 정한다.
 *  - 완료로 바뀌거나 완료 상태에서 수단을 고치면: 수단은 입력값 → 예정 수단 → 고객 마스터 순으로 기본값. 경로는 입력값 없으면 'manual'.
 *  - 대기·지연으로 되돌리면 두 칸을 비운다.
 *  - 상태를 건드리지 않고 수단만 보내도 완료 건이면 반영한다 (자동 기록이 틀렸을 때 고치는 용도).
 */
export function resolvePaidPatch(input: ResolvePaidPatchInput): ResolvePaidPatchResult {
  const nextStatus = input.status ?? input.current.status
  const touchesMethod = input.paid_method !== undefined || input.paid_via !== undefined
  const becomesPaid = nextStatus === 'paid' && input.current.status !== 'paid'

  if (nextStatus !== 'paid') {
    if (input.status !== undefined && input.current.status === 'paid') return { ok: true, patch: { paid_method: null, paid_via: null } }
    if (touchesMethod) return { ok: false, error: '결제수단은 완료된 청구서에만 기록할 수 있습니다.' }
    return { ok: true, patch: {} }
  }

  if (!becomesPaid && !touchesMethod) return { ok: true, patch: {} }

  if (input.paid_via !== undefined && input.paid_via !== null && !isPaidVia(input.paid_via)) {
    return { ok: false, error: '처리 경로 값이 올바르지 않습니다.' }
  }
  const rawMethod = input.paid_method !== undefined && input.paid_method !== null && input.paid_method !== ''
    ? input.paid_method
    : (input.current.paid_method ?? input.current.payment_method_snapshot ?? input.customerMethod ?? null)
  const method = rawMethod ? normalizePaymentMethod(rawMethod) : null
  if (rawMethod && !method) return { ok: false, error: `알 수 없는 결제수단입니다: ${rawMethod}` }

  const via: PaidVia | null = input.paid_via !== undefined && input.paid_via !== null
    ? input.paid_via
    : (becomesPaid ? 'manual' : (isPaidVia(input.current.paid_via) ? input.current.paid_via : 'manual'))

  return { ok: true, patch: { paid_method: method, paid_via: via } }
}
