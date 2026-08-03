import type { PayrollInput, PayrollResult } from './types'

export interface LegalIssue {
  item: number   // §48② 항목 번호 (1-6)
  field: string
  message: string
}

export interface LegalValidationResult {
  valid: boolean
  issues: LegalIssue[]
}

/**
 * 근로기준법 §48② 임금명세서 법정 필수기재사항 6가지 검증 (순수 함수)
 *
 * 1호: 근로자 식별정보
 * 2호: 임금 지급일
 * 3호: 임금 총액 (총지급 + 실지급)
 * 4호: 임금 구성항목별 금액
 * 5호: 임금 구성항목별 계산방법
 * 6호: 공제항목별 금액과 합계
 *
 * @param workerName 근로자 성명 (null이면 1호 검사 생략 — 미리보기 모드용)
 */
export function validatePayslipLegal(
  workerName: string | null,
  input: PayrollInput,
  result: PayrollResult,
): LegalValidationResult {
  const issues: LegalIssue[] = []

  // 1호: 근로자 식별정보
  if (workerName !== null && !workerName.trim()) {
    issues.push({ item: 1, field: 'workerName', message: '근로자 성명이 누락되었습니다 (§48②1호)' })
  }

  // 2호: 임금 지급일
  if (!input.paymentDate?.trim()) {
    issues.push({ item: 2, field: 'paymentDate', message: '임금 지급일이 누락되었습니다 (§48②2호)' })
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paymentDate)) {
    issues.push({ item: 2, field: 'paymentDate', message: '임금 지급일 형식이 올바르지 않습니다 — YYYY-MM-DD 형식으로 입력하세요 (§48②2호)' })
  }

  // 3호: 임금 총액 및 실지급액
  if (result.grossPay <= 0) {
    issues.push({ item: 3, field: 'grossPay', message: `임금 총액이 0원 이하입니다 — 급여 기준을 입력하세요 (§48②3호)` })
  }
  if (result.netPay < 0) {
    issues.push({ item: 3, field: 'netPay', message: `실지급액이 음수입니다 (${result.netPay.toLocaleString('ko-KR')}원) — 공제 합계가 총지급액을 초과합니다 (§48②3호)` })
  }

  // 4호: 임금 구성항목별 금액
  if (result.payItems.length === 0) {
    issues.push({ item: 4, field: 'payItems', message: '임금 구성항목이 없습니다 — 최소 1개의 지급 항목이 필요합니다 (§48②4호)' })
  }

  // 5호: 임금 구성항목별 계산방법
  const missingCalcPay = result.payItems.filter(i => !i.calcMethod?.trim())
  const missingCalcDeduct = result.deductItems.filter(i => !i.calcMethod?.trim())
  if (missingCalcPay.length > 0 || missingCalcDeduct.length > 0) {
    const labels = [
      ...missingCalcPay.map(i => i.label),
      ...missingCalcDeduct.map(i => i.label),
    ].join(', ')
    issues.push({ item: 5, field: 'calcMethod', message: `계산방법 미기재 항목: ${labels} (§48②5호)` })
  }

  // 6호: 공제항목별 금액과 합계 (공제가 없는 것은 합법; 음수는 오류)
  if (result.totalDeduction < 0) {
    issues.push({ item: 6, field: 'totalDeduction', message: `공제 합계가 음수입니다 (${result.totalDeduction.toLocaleString('ko-KR')}원) (§48②6호)` })
  }

  return { valid: issues.length === 0, issues }
}
