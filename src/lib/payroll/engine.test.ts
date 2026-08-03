import { describe, test, expect } from 'vitest'
import { calculatePayroll, calcOrdinaryHourlyWage } from './engine'
import { DEFAULT_RATES_2026 } from './types'
import type { PayrollInput } from './types'

const BASE: Omit<PayrollInput, 'employmentType'> = {
  payPeriod: { year: 2026, month: 8 },
  paymentDate: '2026-08-25',
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
  incomeTax: 0,
  dependents: 1,
  otherDeductions: 0,
}

// ── CASE A: 정규직 월급제 ─────────────────────────────────────────────────────
describe('CASE A - 정규직 월급제', () => {
  const input: PayrollInput = {
    ...BASE,
    employmentType: 'FULL_TIME',
    monthlyBaseSalary: 2_400_000,
    contractedMonthlyHours: 209,
    mealAllowance: 200_000,
  }

  test('통상시급 = 11,483', () => {
    expect(calcOrdinaryHourlyWage(input, DEFAULT_RATES_2026)).toBe(11_483)
  })

  test('지급액계 = 2,600,000', () => {
    expect(calculatePayroll(input, DEFAULT_RATES_2026).grossPay).toBe(2_600_000)
  })

  test('비과세 = 200,000', () => {
    expect(calculatePayroll(input, DEFAULT_RATES_2026).nonTaxable).toBe(200_000)
  })

  test('과세대상 = 2,400,000', () => {
    expect(calculatePayroll(input, DEFAULT_RATES_2026).taxablePay).toBe(2_400_000)
  })

  test('공제액계 = 233,210', () => {
    expect(calculatePayroll(input, DEFAULT_RATES_2026).totalDeduction).toBe(233_210)
  })

  test('실지급액 = 2,366,790', () => {
    expect(calculatePayroll(input, DEFAULT_RATES_2026).netPay).toBe(2_366_790)
  })

  test('회사부담 총계 = 474,750 (산재 0.7% 가정)', () => {
    const rates = { ...DEFAULT_RATES_2026, industrial_accident_rate: 0.007 }
    expect(calculatePayroll(input, rates).employerCost.total).toBe(474_750)
  })
})

// ── CASE B: 아르바이트 시급제 ─────────────────────────────────────────────────
describe('CASE B - 아르바이트 시급제', () => {
  const input: PayrollInput = {
    ...BASE,
    employmentType: 'PART_TIME',
    hourlyWage: 10_320,
    contractedWeeklyHours: 20,
    actualMonthlyHours: 87,
    mealAllowance: 200_000,
  }

  test('지급액계 = 1,277,202', () => {
    expect(calculatePayroll(input, DEFAULT_RATES_2026).grossPay).toBe(1_277_202)
  })

  test('공제액계 = 104,640', () => {
    expect(calculatePayroll(input, DEFAULT_RATES_2026).totalDeduction).toBe(104_640)
  })

  test('실지급액 = 1,172,562', () => {
    expect(calculatePayroll(input, DEFAULT_RATES_2026).netPay).toBe(1_172_562)
  })
})

// ── CASE C: 일용직 ────────────────────────────────────────────────────────────
describe('CASE C-1 - 일용직 (일당 150,000 × 5일)', () => {
  const input: PayrollInput = {
    ...BASE,
    employmentType: 'DAILY',
    dailyWage: 150_000,
    workDays: 5,
    enrolledNationalPension: false,
    enrolledHealthInsurance: false,
  }

  test('지급액계 = 750,000', () => {
    expect(calculatePayroll(input, DEFAULT_RATES_2026).grossPay).toBe(750_000)
  })

  test('소득세 = 0 (일당 15만 이하)', () => {
    const result = calculatePayroll(input, DEFAULT_RATES_2026)
    const incomeTax = result.deductItems.find(d => d.key === 'income_tax')
    expect(incomeTax).toBeUndefined()
  })

  test('공제액계 = 6,750 (고용보험만)', () => {
    expect(calculatePayroll(input, DEFAULT_RATES_2026).totalDeduction).toBe(6_750)
  })

  test('실지급액 = 743,250', () => {
    expect(calculatePayroll(input, DEFAULT_RATES_2026).netPay).toBe(743_250)
  })
})

describe('CASE C-2 - 일용직 (일당 200,000 × 5일)', () => {
  const input: PayrollInput = {
    ...BASE,
    employmentType: 'DAILY',
    dailyWage: 200_000,
    workDays: 5,
    enrolledNationalPension: false,
    enrolledHealthInsurance: false,
  }

  test('지급액계 = 1,000,000', () => {
    expect(calculatePayroll(input, DEFAULT_RATES_2026).grossPay).toBe(1_000_000)
  })

  test('공제액계 = 16,420', () => {
    expect(calculatePayroll(input, DEFAULT_RATES_2026).totalDeduction).toBe(16_420)
  })

  test('실지급액 = 983,580', () => {
    expect(calculatePayroll(input, DEFAULT_RATES_2026).netPay).toBe(983_580)
  })
})

// ── CASE D: 프리랜서 ──────────────────────────────────────────────────────────
describe('CASE D - 프리랜서', () => {
  const input: PayrollInput = {
    ...BASE,
    employmentType: 'FREELANCER',
    monthlyBaseSalary: 1_000_000,
    enrolledNationalPension: false,
    enrolledHealthInsurance: false,
    enrolledEmploymentInsurance: false,
  }

  test('지급액계 = 1,000,000', () => {
    expect(calculatePayroll(input, DEFAULT_RATES_2026).grossPay).toBe(1_000_000)
  })

  test('공제액계 = 33,000', () => {
    expect(calculatePayroll(input, DEFAULT_RATES_2026).totalDeduction).toBe(33_000)
  })

  test('실지급액 = 967,000', () => {
    expect(calculatePayroll(input, DEFAULT_RATES_2026).netPay).toBe(967_000)
  })
})

// ── 경계값 테스트 ──────────────────────────────────────────────────────────────
describe('경계값 - 일용직 소득세 소액부징수', () => {
  const makeDaily = (wage: number): PayrollInput => ({
    ...BASE,
    employmentType: 'DAILY',
    dailyWage: wage,
    workDays: 1,
    enrolledNationalPension: false,
    enrolledHealthInsurance: false,
  })

  test('일당 187,000 → 소득세 0 (소액부징수)', () => {
    const result = calculatePayroll(makeDaily(187_000), DEFAULT_RATES_2026)
    const incomeTax = result.deductItems.find(d => d.key === 'income_tax')
    expect(incomeTax).toBeUndefined()
  })

  test('일당 187,100 → 소득세 발생', () => {
    const result = calculatePayroll(makeDaily(187_100), DEFAULT_RATES_2026)
    const incomeTax = result.deductItems.find(d => d.key === 'income_tax')
    expect(incomeTax).toBeDefined()
    expect((incomeTax?.amount ?? 0)).toBeGreaterThan(0)
  })
})

// ── 주휴수당 ──────────────────────────────────────────────────────────────────
describe('주휴수당 - 주 소정근로시간 기준', () => {
  const makePartTime = (weeklyHours: number): PayrollInput => ({
    ...BASE,
    employmentType: 'PART_TIME',
    hourlyWage: 10_320,
    contractedWeeklyHours: weeklyHours,
    actualMonthlyHours: 60,
  })

  test('주 14시간 → 주휴수당 0', () => {
    const result = calculatePayroll(makePartTime(14), DEFAULT_RATES_2026)
    const holiday = result.payItems.find(i => i.key === 'weekly_holiday')
    expect(holiday).toBeUndefined()
  })

  test('주 15시간 → 주휴수당 발생', () => {
    const result = calculatePayroll(makePartTime(15), DEFAULT_RATES_2026)
    const holiday = result.payItems.find(i => i.key === 'weekly_holiday')
    expect(holiday).toBeDefined()
    expect((holiday?.amount ?? 0)).toBeGreaterThan(0)
  })
})

// ── 국민연금 상한/하한 ─────────────────────────────────────────────────────────
describe('국민연금 기준소득월액 clamp', () => {
  const makeFullTime = (salary: number): PayrollInput => ({
    ...BASE,
    employmentType: 'FULL_TIME',
    monthlyBaseSalary: salary,
    contractedMonthlyHours: 209,
  })

  test('과세급여 7,000,000 → 국민연금 상한(6,370,000) 기준 계산', () => {
    const result = calculatePayroll(makeFullTime(7_000_000), DEFAULT_RATES_2026)
    const np = result.deductItems.find(d => d.key === 'national_pension')
    // floor10(6,370,000 * 0.0475) = floor10(302,575) = 302,570
    expect(np?.amount).toBe(302_570)
  })

  test('과세급여 300,000 → 국민연금 하한(400,000) 기준 계산', () => {
    const result = calculatePayroll(makeFullTime(300_000), DEFAULT_RATES_2026)
    const np = result.deductItems.find(d => d.key === 'national_pension')
    // floor10(400,000 * 0.0475) = 19,000
    expect(np?.amount).toBe(19_000)
  })
})

// ── 식대 한도초과 과세 ─────────────────────────────────────────────────────────
describe('식대 비과세/과세 분리', () => {
  test('식대 250,000 → 200,000 비과세 + 50,000 과세', () => {
    const input: PayrollInput = {
      ...BASE,
      employmentType: 'FULL_TIME',
      monthlyBaseSalary: 2_000_000,
      mealAllowance: 250_000,
    }
    const result = calculatePayroll(input, DEFAULT_RATES_2026)
    expect(result.nonTaxable).toBe(200_000)
    const mealTaxable = result.payItems.find(i => i.key === 'meal_taxable')
    expect(mealTaxable?.amount).toBe(50_000)
  })
})
