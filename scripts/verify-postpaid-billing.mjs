// Phase 5 검증: 후납 due_date 계산이 사용자 시나리오와 일치하는지 스팟체크
import { generateBillingSchedule } from '../src/lib/billing-generator.ts'

const cases = [
  {
    name: '사용자 예제: 2026-07-18 월간 후납, 계약 3개월',
    input: {
      serviceType: '정기엔드케어',
      billingCycle: '월간',
      contractStartDate: '2026-07-18',
      contractEndDate: '2026-09-30',
      paymentDay: 17,
      billingAmount: 1089000,
      billingTiming: 'postpaid',
    },
    expect: [
      { billing_period: '2026-07', due_date: '2026-08-17' },
      { billing_period: '2026-08', due_date: '2026-09-17' },
      { billing_period: '2026-09', due_date: '2026-10-17' },
    ],
  },
  {
    name: '엣지: 1월 31일 월간 후납 (2월 clamp)',
    input: {
      serviceType: '정기딥케어',
      billingCycle: '월간',
      contractStartDate: '2026-01-31',
      contractEndDate: '2026-03-31',
      paymentDay: 30,
      billingAmount: 500000,
      billingTiming: 'postpaid',
    },
    expect: [
      { billing_period: '2026-01', due_date: '2026-02-27' }, // K=1: (2026-02-28 clamp) - 1일
      { billing_period: '2026-02', due_date: '2026-03-30' }, // K=2: 2026-03-31 - 1일
      { billing_period: '2026-03', due_date: '2026-04-29' }, // K=3: (2026-04-30 clamp) - 1일
    ],
  },
  {
    name: '2026-07-18 연간 후납',
    input: {
      serviceType: '정기딥케어',
      billingCycle: '연간',
      contractStartDate: '2026-07-18',
      contractEndDate: '2028-06-30',
      paymentDay: 17,
      billingAmount: 12000000,
      billingTiming: 'postpaid',
    },
    expect: [
      { billing_period: '2026', due_date: '2027-07-17' },
      { billing_period: '2027', due_date: '2028-07-17' },
      { billing_period: '2028', due_date: '2029-07-17' },
    ],
  },
  {
    name: '선납 회귀: 2026-07-18 월간 (기존 로직 무변경 확인)',
    input: {
      serviceType: '정기엔드케어',
      billingCycle: '월간',
      contractStartDate: '2026-07-18',
      contractEndDate: '2026-09-30',
      paymentDay: 25,
      billingAmount: 1089000,
      billingTiming: 'prepaid',
    },
    expect: [
      { billing_period: '2026-07', due_date: '2026-07-25' },
      { billing_period: '2026-08', due_date: '2026-08-25' },
      { billing_period: '2026-09', due_date: '2026-09-25' },
    ],
  },
]

let pass = 0, fail = 0
for (const c of cases) {
  const result = generateBillingSchedule(c.input)
  const got = result.map(r => ({ billing_period: r.billing_period, due_date: r.due_date }))
  const ok = JSON.stringify(got) === JSON.stringify(c.expect)
  console.log(`\n[${ok ? 'PASS' : 'FAIL'}] ${c.name}`)
  if (!ok) {
    console.log('  expected:', c.expect)
    console.log('  got     :', got)
  } else {
    console.log('  ->', got.map(g => `${g.billing_period}→${g.due_date}`).join(', '))
  }
  ok ? pass++ : fail++
}

console.log(`\n=== ${pass}/${pass+fail} passed ===`)
process.exit(fail === 0 ? 0 : 1)
