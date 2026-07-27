/**
 * Phase 27-E: 고객관리 캘린더뷰·리스트뷰 금액 계산 헬퍼.
 *
 * 사용자 확정 규칙:
 * - 1회성케어: service_applications의 supply_amount + vat (부가세 미적용 시 vat 제외)
 * - 정기딥케어: 회차에 supply_amount가 매핑되어 있으면 그 값 사용, 없으면 0
 * - 정기엔드케어: 아예 제외 (매 방문마다 변동 요금이라 회차 금액 파싱 불가)
 * - 일반일정: 0 (내부 일정, 매출 아님)
 * - 표시: 풀 표기 (333,000원). 정확/추정 구분 없이 단일 표시.
 */

export interface AmountApp {
  service_type: string | null
  supply_amount?: number | null
  vat?: number | null
  payment_method?: string | null
}

/** 부가세 미적용 결제 방법 판별 (서비스관리 로직과 동일) */
function isNoVatMethod(method: string | null | undefined): boolean {
  if (!method) return false
  return method.includes('비과세') || method.includes('미희망') || method === '현금(부가세 X)'
}

/**
 * 회차 한 건의 금액 계산.
 * 계산 못하는 케이스는 0 (표시 안 됨).
 */
export function computeAppAmount(app: AmountApp): number {
  // 정기엔드케어·일반일정은 매출 계산에서 완전 제외
  if (app.service_type === '정기엔드케어') return 0
  if (app.service_type === '일반일정') return 0

  const supply = Number(app.supply_amount ?? 0)
  if (supply <= 0) return 0

  const vat = isNoVatMethod(app.payment_method) ? 0 : Number(app.vat ?? 0)
  return supply + vat
}

/** 금액 → "333,000원" 풀 표기 */
export function fmtAmount(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`
}
