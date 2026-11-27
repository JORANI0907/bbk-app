import { describe, it, expect } from 'vitest'
import {
  amountsFromSupply, amountsFromTotal, applyContractTermVars, describeAmount, describePaymentTerms,
  describePeriod, describeVisitSchedule, formatWon, parseWon, FILL_PLACEHOLDER,
} from '../contract-terms'

describe('금액', () => {
  it('숫자만 뽑고 형식을 맞춘다', () => {
    expect(parseWon('1,840,000원')).toBe(1840000)
    expect(parseWon('')).toBeNull()
    expect(parseWon(undefined)).toBeNull()
    expect(formatWon(2024000)).toBe('2,024,000원')
    expect(formatWon(null)).toBe('')
  })
  it('공급가액 → 부가세 10% 절사·총액, 총액 → 역산', () => {
    expect(amountsFromSupply(1840000)).toEqual({ supply: 1840000, vat: 184000, total: 2024000 })
    expect(amountsFromSupply(1234567)).toEqual({ supply: 1234567, vat: 123456, total: 1358023 })
    expect(amountsFromTotal(2024000)).toEqual({ supply: 1840000, vat: 184000, total: 2024000 })
  })
  it('계약 금액 한 줄 설명', () => {
    expect(describeAmount({ amount_total: '2024000', amount_supply: '1840000', amount_vat: '184000' }))
      .toBe('2,024,000원 (공급 1,840,000원 + 부가세 184,000원)')
    expect(describeAmount({ amount_total: '2024000' })).toBe('2,024,000원')
    expect(describeAmount({})).toBe('')
  })
})

describe('고객 마스터 → 기본 문장', () => {
  it('방문 주기', () => {
    expect(describeVisitSchedule({ visit_cycle_unit: 'month', visit_cycle_value: 6, visit_cycle_config: { dates: [1] }, construction_time: '21:00' })).toBe('6개월마다 1일 21:00')
    expect(describeVisitSchedule({ visit_cycle_unit: 'week', visit_cycle_value: 1, visit_cycle_config: { weekdays: [1, 3, 5] }, construction_time: '22:00:00' })).toBe('매주 월·수·금요일 (주 3회) 22:00')
    expect(describeVisitSchedule({ visit_cycle_unit: 'week', visit_cycle_value: 1, visit_cycle_config: { weekdays: [0, 1, 2, 4, 3, 5, 6] } })).toBe('매일 (주 7회)')
    expect(describeVisitSchedule({ visit_cycle_unit: 'week', visit_cycle_value: 1, visit_cycle_config: { weekdays: [1, 2, 3, 4, 5] } })).toBe('평일 매일 (월~금)')
    expect(describeVisitSchedule({ visit_cycle_unit: 'week', visit_cycle_value: 2, visit_cycle_config: {} })).toBe('격주')
    expect(describeVisitSchedule({ visit_cycle_unit: 'month', visit_cycle_value: 1, visit_cycle_config: { dates: [15, 30] } })).toBe('매월 15일·30일')
    expect(describeVisitSchedule({ visit_cycle_unit: null })).toBe('')
  })
  it('결제 방식', () => {
    expect(describePaymentTerms({ billing_trigger: 'per_visit', payment_method: 'virtual_account' })).toBe('회차 후불 — 작업 완료 후 청구 · 가상계좌')
    expect(describePaymentTerms({ billing_cycle: '연간', billing_timing: 'prepaid' })).toBe('기간 선납 — 계약 체결 시 1년분 일괄')
    expect(describePaymentTerms({ billing_cycle: '월간', billing_timing: 'postpaid', payment_date: 30, payment_method: 'card' })).toBe('월 후납 — 매월 30일 결제 · 카드')
    expect(describePaymentTerms({ billing_cycle: '월간', billing_timing: 'prepaid', payment_date: 7, payment_method: 'credit_card' })).toBe('월 선납 — 매월 7일 결제 · 카드')
    expect(describePaymentTerms({})).toBe('')
  })
  it('기간', () => {
    expect(describePeriod('2027-05-01', '2032-04-30')).toBe('2027-05-01 ~ 2032-04-30')
    expect(describePeriod('', '')).toBe('')
  })
})

describe('applyContractTermVars', () => {
  const html = '<td>{{계약기간}}</td><td>{{청소범위}}</td><td>{{방문주기}}</td><td>{{회당공급가액}}</td><td>{{회당부가세}}</td><td>{{회당총액}}</td><td>{{결제방식}}</td><td>{{사업장}}</td>'

  it('값이 있으면 채우고 줄바꿈은 <br> 로', () => {
    const out = applyContractTermVars(html, {
      contract_start_date: '2027-05-01', contract_end_date: '2032-04-30', care_scope: 'A\nB', address: '강남구 <1층>',
      amount_supply: '1840000', amount_vat: '184000', amount_total: '2024000', visit_schedule: '6개월마다 1일 21:00', payment_terms: '회차 후불',
    })
    expect(out).toContain('2027-05-01 ~ 2032-04-30')
    expect(out).toContain('A<br>B')
    expect(out).toContain('1,840,000원')
    expect(out).toContain('184,000원')
    expect(out).toContain('2,024,000원')
    expect(out).toContain('강남구 &lt;1층&gt;')
    expect(out).not.toContain('{{')
  })

  it('비어 있으면 "(계약 체결 시 기재)" 를 남긴다', () => {
    const out = applyContractTermVars(html, {})
    expect((out.match(new RegExp(FILL_PLACEHOLDER.replace(/[()]/g, '\\$&'), 'g')) ?? []).length).toBe(8)
  })
})
