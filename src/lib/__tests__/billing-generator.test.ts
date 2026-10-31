import { describe, it, expect } from 'vitest'
import { generateBillingSchedule } from '../billing-generator'

const base = {
  serviceType: '정기딥케어',
  contractStartDate: '2026-11-15',
  contractEndDate: '2027-11-14',
  billingAmount: 187000,
}

describe('generateBillingSchedule — 결제 방식 3종 단순화 (2026-11-01)', () => {
  it('결제주기 3개월 · 선납 · 결제일자 없음 → 계약 시작일의 일(15일)에 3개월마다', () => {
    const r = generateBillingSchedule({ ...base, billingCycle: '3개월', paymentDay: null, billingTiming: 'prepaid' })
    expect(r.slice(0, 3).map(b => b.due_date)).toEqual(['2026-11-15', '2027-02-15', '2027-05-15'])
  })

  it('결제주기 1개월 · 후납 · 결제일자 없음 → 다음 달 15일 (주기 종료 다음날이 아니라 결제일자 기준)', () => {
    const r = generateBillingSchedule({ ...base, billingCycle: '월간', paymentDay: null, billingTiming: 'postpaid' })
    expect(r.slice(0, 2).map(b => b.due_date)).toEqual(['2026-12-15', '2027-01-15'])
  })

  it('결제주기 1개월 · 후납 · 결제일자 5일 → 다음 달 5일', () => {
    const r = generateBillingSchedule({ ...base, billingCycle: '월간', paymentDay: 5, billingTiming: 'postpaid' })
    expect(r[0].due_date).toBe('2026-12-05')
  })

  it('결제일자 31일인데 다음 달이 30일까지면 말일로 당긴다', () => {
    const r = generateBillingSchedule({
      ...base, contractStartDate: '2026-10-31', billingCycle: '월간', paymentDay: 31, billingTiming: 'postpaid',
    })
    expect(r[0].due_date).toBe('2026-11-30')
  })

  it('롤링파스타 사례: 10/30 계약 · 1개월 · 선납은 10/30부터, 후납은 11/30부터 (한 주기 차이)', () => {
    const common = { ...base, contractStartDate: '2026-10-30', contractEndDate: '2027-10-29', billingCycle: '월간', paymentDay: null }
    const pre = generateBillingSchedule({ ...common, billingTiming: 'prepaid' }).slice(0, 3).map(b => b.due_date)
    const post = generateBillingSchedule({ ...common, billingTiming: 'postpaid' }).slice(0, 3).map(b => b.due_date)
    expect(pre).toEqual(['2026-10-30', '2026-11-30', '2026-12-30'])
    expect(post).toEqual(['2026-11-30', '2026-12-30', '2027-01-30'])
  })

  it('연간 선납 → 계약 시작일에 1건', () => {
    const r = generateBillingSchedule({ ...base, billingCycle: '연간', paymentDay: null, billingTiming: 'prepaid' })
    expect(r[0]).toMatchObject({ billing_type: 'annual', billing_period: '2026', due_date: '2026-11-15' })
  })
})
