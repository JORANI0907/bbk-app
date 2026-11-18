import { describe, it, expect, vi } from 'vitest'

vi.mock('../portone', () => ({ getPortOneClient: () => null }))

import { paidMethodLabel, paymentMethodFromPortOne } from '../portone-method'

describe('paidMethodLabel — Slack 결제수단 표기', () => {
  it('실제 결제수단을 한글로', () => {
    expect(paidMethodLabel('credit_card')).toBe('카드 결제')
    expect(paidMethodLabel('virtual_account')).toBe('가상계좌 입금')
    expect(paidMethodLabel('bank_transfer')).toBe('계좌이체')
  })

  it('조회 실패(null)면 미확인으로 표시하고 "정기결제"라고 쓰지 않는다', () => {
    expect(paidMethodLabel(null)).toBe('결제수단 미확인')
    expect(paidMethodLabel(undefined)).not.toContain('정기')
  })
})

describe('paymentMethodFromPortOne', () => {
  it('포트원 method.type 으로 수단 판별', () => {
    expect(paymentMethodFromPortOne({ method: { type: 'PaymentMethodCard' } })).toBe('credit_card')
    expect(paymentMethodFromPortOne({ method: { type: 'PaymentMethodVirtualAccount' } })).toBe('virtual_account')
    expect(paymentMethodFromPortOne({ method: { type: 'PaymentMethodTransfer' } })).toBe('bank_transfer')
    expect(paymentMethodFromPortOne({})).toBeNull()
  })
})
