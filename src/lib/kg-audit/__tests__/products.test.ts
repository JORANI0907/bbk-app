import { describe, it, expect } from 'vitest'
import {
  ALL_PRODUCTS,
  ONE_TIME_PRODUCTS,
  SUBSCRIPTION_PRODUCTS,
  SUBSCRIPTION_MONTHLY_PRODUCTS,
  SUBSCRIPTION_YEARLY_PRODUCTS,
  getSubscriptionProducts,
  findProduct,
  isSubscriptionCode,
  calcTotalAmount,
} from '../products'

describe('kg-audit 상품 카탈로그', () => {
  it('1,000원 결제 테스트 상품이 없다', () => {
    expect(findProduct('test-onetime')).toBeUndefined()
    expect(findProduct('test-subscription')).toBeUndefined()
    expect(ALL_PRODUCTS.some((p) => p.category === '결제 테스트')).toBe(false)
    expect(ALL_PRODUCTS.some((p) => p.price < 10000)).toBe(false)
  })

  it('상품 코드가 중복되지 않는다', () => {
    const codes = ALL_PRODUCTS.map((p) => p.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('연 단위 정기 상품은 월 상품과 1:1 대응이고 금액은 12배다', () => {
    expect(SUBSCRIPTION_YEARLY_PRODUCTS).toHaveLength(SUBSCRIPTION_MONTHLY_PRODUCTS.length)
    for (const monthly of SUBSCRIPTION_MONTHLY_PRODUCTS) {
      const yearly = findProduct(`${monthly.code}-yr`)
      expect(yearly).toBeDefined()
      expect(yearly!.price).toBe(monthly.price * 12)
      expect(yearly!.unit).toBe('년')
      expect(yearly!.billingType).toBe('subscription')
      expect(yearly!.label).toBe(monthly.label)
      expect(yearly!.category).toBe(monthly.category)
    }
  })

  it('월·연 토글용 조회 함수가 주기별 목록을 돌려준다', () => {
    expect(getSubscriptionProducts('monthly')).toEqual(SUBSCRIPTION_MONTHLY_PRODUCTS)
    expect(getSubscriptionProducts('yearly')).toEqual(SUBSCRIPTION_YEARLY_PRODUCTS)
    expect(SUBSCRIPTION_PRODUCTS).toHaveLength(
      SUBSCRIPTION_MONTHLY_PRODUCTS.length + SUBSCRIPTION_YEARLY_PRODUCTS.length,
    )
  })

  it('200만원을 넘는 결제 상품이 존재한다 (PG 한도 증액 심사용)', () => {
    expect(SUBSCRIPTION_YEARLY_PRODUCTS.some((p) => p.price > 2_000_000)).toBe(true)
  })

  it('연 단위 코드도 정기 상품으로 판별되고 금액 계산에 포함된다', () => {
    const yearly = SUBSCRIPTION_YEARLY_PRODUCTS[0]
    expect(isSubscriptionCode(yearly.code)).toBe(true)
    expect(calcTotalAmount([yearly.code])).toBe(yearly.price)
  })

  it('1회성 상품은 30개다', () => {
    expect(ONE_TIME_PRODUCTS).toHaveLength(30)
    expect(ONE_TIME_PRODUCTS.every((p) => p.billingType === 'one-time')).toBe(true)
  })
})
