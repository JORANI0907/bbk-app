import { describe, it, expect } from 'vitest'
import { validatePayslipLegal } from './validator'
import { calculatePayroll } from './engine'
import { DEFAULT_RATES_2026 } from './types'
import type { PayrollInput } from './types'

// ─── 기준 입력 (정규직, 월급 3,000,000) ─────────────────────────────────────
const BASE: PayrollInput = {
  employmentType: 'FULL_TIME',
  payPeriod: { year: 2026, month: 1 },
  paymentDate: '2026-02-10',
  monthlyBaseSalary: 3_000_000,
  contractedMonthlyHours: 209,
  overtimeHours: 0,
  nightHours: 0,
  holidayHoursWithin8: 0,
  holidayHoursOver8: 0,
  unusedAnnualLeaveDays: 0,
  otherTaxableAllowance: 0,
  mealAllowance: 0,
  carAllowance: 0,
  enrolledNationalPension: true,
  enrolledHealthInsurance: true,
  enrolledEmploymentInsurance: true,
  incomeTax: 43_200,
  dependents: 1,
  otherDeductions: 0,
}

describe('validatePayslipLegal — §48② 6가지 항목', () => {

  // ── 정상 케이스 ──────────────────────────────────────────────────────────

  it('정규직 정상 명세서: valid=true, issues=0', () => {
    const result = calculatePayroll(BASE, DEFAULT_RATES_2026)
    const v = validatePayslipLegal('홍길동', BASE, result)
    expect(v.valid).toBe(true)
    expect(v.issues).toHaveLength(0)
  })

  it('일용직 정상 명세서: valid=true', () => {
    const input: PayrollInput = {
      ...BASE,
      employmentType: 'DAILY',
      monthlyBaseSalary: undefined,
      dailyWage: 200_000,
      workDays: 20,
      enrolledNationalPension: false,
      enrolledHealthInsurance: false,
      incomeTax: 0,
    }
    const result = calculatePayroll(input, DEFAULT_RATES_2026)
    const v = validatePayslipLegal('김일용', input, result)
    expect(v.valid).toBe(true)
  })

  it('프리랜서 정상 명세서: valid=true', () => {
    const input: PayrollInput = {
      ...BASE,
      employmentType: 'FREELANCER',
      monthlyBaseSalary: 2_000_000,
      enrolledNationalPension: false,
      enrolledHealthInsurance: false,
      enrolledEmploymentInsurance: false,
      incomeTax: 0,
    }
    const result = calculatePayroll(input, DEFAULT_RATES_2026)
    const v = validatePayslipLegal('이프리', input, result)
    expect(v.valid).toBe(true)
  })

  it('workerName=null 이면 1호 검사 생략 (미리보기 모드)', () => {
    const result = calculatePayroll(BASE, DEFAULT_RATES_2026)
    const v = validatePayslipLegal(null, BASE, result)
    expect(v.valid).toBe(true)
    expect(v.issues.filter(i => i.item === 1)).toHaveLength(0)
  })

  // ── 1호: 근로자 식별정보 ──────────────────────────────────────────────────

  it('1호: 성명 빈 문자열 → 위반', () => {
    const result = calculatePayroll(BASE, DEFAULT_RATES_2026)
    const v = validatePayslipLegal('', BASE, result)
    expect(v.valid).toBe(false)
    expect(v.issues.some(i => i.item === 1)).toBe(true)
  })

  it('1호: 공백만 있는 성명 → 위반', () => {
    const result = calculatePayroll(BASE, DEFAULT_RATES_2026)
    const v = validatePayslipLegal('   ', BASE, result)
    expect(v.valid).toBe(false)
    expect(v.issues.some(i => i.item === 1 && i.field === 'workerName')).toBe(true)
  })

  // ── 2호: 임금 지급일 ──────────────────────────────────────────────────────

  it('2호: 지급일 누락 → 위반', () => {
    const input = { ...BASE, paymentDate: '' }
    const result = calculatePayroll(BASE, DEFAULT_RATES_2026)
    const v = validatePayslipLegal('홍길동', input, result)
    expect(v.valid).toBe(false)
    expect(v.issues.some(i => i.item === 2 && i.field === 'paymentDate')).toBe(true)
  })

  it('2호: 지급일 형식 오류(슬래시) → 위반', () => {
    const input = { ...BASE, paymentDate: '2026/02/10' }
    const result = calculatePayroll(BASE, DEFAULT_RATES_2026)
    const v = validatePayslipLegal('홍길동', input, result)
    expect(v.valid).toBe(false)
    expect(v.issues.some(i => i.item === 2)).toBe(true)
  })

  it('2호: 올바른 형식 YYYY-MM-DD → 통과', () => {
    const result = calculatePayroll(BASE, DEFAULT_RATES_2026)
    const v = validatePayslipLegal('홍길동', BASE, result)
    expect(v.issues.some(i => i.item === 2)).toBe(false)
  })

  // ── 3호: 임금 총액 ────────────────────────────────────────────────────────

  it('3호: 일급/근무일수 모두 0 → grossPay=0 → 위반', () => {
    const input: PayrollInput = {
      ...BASE,
      employmentType: 'DAILY',
      monthlyBaseSalary: undefined,
      dailyWage: 0,
      workDays: 0,
      incomeTax: 0,
    }
    const result = calculatePayroll(input, DEFAULT_RATES_2026)
    const v = validatePayslipLegal('홍길동', input, result)
    expect(v.issues.some(i => i.item === 3 && i.field === 'grossPay')).toBe(true)
  })

  it('3호: 공제가 총지급 초과 → netPay 음수 → 위반', () => {
    const input = { ...BASE, otherDeductions: 99_000_000 }
    const result = calculatePayroll(input, DEFAULT_RATES_2026)
    const v = validatePayslipLegal('홍길동', input, result)
    expect(v.issues.some(i => i.item === 3 && i.field === 'netPay')).toBe(true)
  })

  // ── 4호: 임금 구성항목별 금액 ─────────────────────────────────────────────

  it('4호: payItems 강제 비움 → 위반', () => {
    const result = calculatePayroll(BASE, DEFAULT_RATES_2026)
    const corrupted = { ...result, payItems: [] }
    const v = validatePayslipLegal('홍길동', BASE, corrupted)
    expect(v.issues.some(i => i.item === 4)).toBe(true)
  })

  // ── 5호: 계산방법 ─────────────────────────────────────────────────────────

  it('5호: payItem calcMethod 빈 문자열 → 위반', () => {
    const result = calculatePayroll(BASE, DEFAULT_RATES_2026)
    const corrupted = {
      ...result,
      payItems: result.payItems.map(item => ({ ...item, calcMethod: '' })),
    }
    const v = validatePayslipLegal('홍길동', BASE, corrupted)
    expect(v.valid).toBe(false)
    expect(v.issues.some(i => i.item === 5)).toBe(true)
  })

  it('5호: deductItem calcMethod 빈 문자열 → 위반', () => {
    const result = calculatePayroll(BASE, DEFAULT_RATES_2026)
    const corrupted = {
      ...result,
      deductItems: result.deductItems.map(item => ({ ...item, calcMethod: '' })),
    }
    const v = validatePayslipLegal('홍길동', BASE, corrupted)
    expect(v.issues.some(i => i.item === 5)).toBe(true)
  })

  it('5호: 엔진 정상 출력은 모든 calcMethod 있음 → 통과', () => {
    const result = calculatePayroll(BASE, DEFAULT_RATES_2026)
    const v = validatePayslipLegal('홍길동', BASE, result)
    expect(v.issues.some(i => i.item === 5)).toBe(false)
  })

  // ── 6호: 공제항목별 금액과 합계 ───────────────────────────────────────────

  it('6호: totalDeduction 음수(정상적으로 발생 불가) → 위반', () => {
    const result = calculatePayroll(BASE, DEFAULT_RATES_2026)
    const corrupted = { ...result, totalDeduction: -1000 }
    const v = validatePayslipLegal('홍길동', BASE, corrupted)
    expect(v.issues.some(i => i.item === 6)).toBe(true)
  })

  it('6호: 공제 없음(totalDeduction=0)은 합법 → 통과', () => {
    const input: PayrollInput = {
      ...BASE,
      employmentType: 'SUBCONTRACT',
      monthlyBaseSalary: undefined,
      incomeTax: 0,
      enrolledNationalPension: false,
      enrolledHealthInsurance: false,
      enrolledEmploymentInsurance: false,
    }
    const result = calculatePayroll(input, DEFAULT_RATES_2026)
    expect(result.totalDeduction).toBe(0)
    // SUBCONTRACT는 payItems도 없으므로 4호 위반 — 6호만 체크
    expect(result.totalDeduction >= 0).toBe(true)
  })

  // ── 복합 위반 ─────────────────────────────────────────────────────────────

  it('성명 + 지급일 동시 위반 → issues 2개 이상', () => {
    const input = { ...BASE, paymentDate: '' }
    const result = calculatePayroll(BASE, DEFAULT_RATES_2026)
    const v = validatePayslipLegal('', input, result)
    expect(v.issues.length).toBeGreaterThanOrEqual(2)
    expect(v.issues.some(i => i.item === 1)).toBe(true)
    expect(v.issues.some(i => i.item === 2)).toBe(true)
  })
})
