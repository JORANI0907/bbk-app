import { describe, it, expect, vi } from 'vitest'

// 발송·DB 모듈은 서버 전용이라 단위 테스트에서는 비워 둔다 (순수 함수만 검증)
vi.mock('../supabase/server', () => ({ createServiceClient: () => ({}) }))
vi.mock('../template-sender', () => ({ sendByTemplate: vi.fn() }))
vi.mock('../notification', () => ({ saveNotificationHistory: vi.fn() }))
vi.mock('../billing-link', () => ({ issueBillingLink: vi.fn() }))

import { isExtraBilling, pickExtraBillingTemplate } from '../extra-billing-notice'
import { renderTemplate } from '../notification-renderer'

describe('1회성 추가 결제 판별', () => {
  it('onetime + 1회성케어 만 추가 결제로 본다', () => {
    expect(isExtraBilling({ billing_type: 'onetime', service_type: '1회성케어' })).toBe(true)
    expect(isExtraBilling({ billing_type: 'onetime', service_type: '정기딥케어' })).toBe(false)
    expect(isExtraBilling({ billing_type: 'monthly', service_type: '1회성케어' })).toBe(false)
    expect(isExtraBilling({ billing_type: null, service_type: null })).toBe(false)
  })
})

describe('추가 결제 템플릿 선택', () => {
  it('비과세 현금 고객은 개인 계좌 템플릿', () => {
    expect(pickExtraBillingTemplate('cash_untaxed')).toBe('추가결제알림(현금)_1회성')
    expect(pickExtraBillingTemplate('현금(비과세)')).toBe('추가결제알림(현금)_1회성')
  })
  it('카드·계좌이체·가상계좌·미지정은 회사 계좌 + 링크 템플릿', () => {
    expect(pickExtraBillingTemplate('credit_card')).toBe('추가결제알림_1회성')
    expect(pickExtraBillingTemplate('virtual_account')).toBe('추가결제알림_1회성')
    expect(pickExtraBillingTemplate('계좌이체')).toBe('추가결제알림_1회성')
    expect(pickExtraBillingTemplate(null)).toBe('추가결제알림_1회성')
  })
})

describe('추가 결제 문자 변수', () => {
  it('{{추가결제내용}} {{추가결제금액}} {{추가결제URL}} 이 청구서 값으로 바뀐다', () => {
    const text = renderTemplate(
      '{{업체명}} · {{추가결제내용}} · {{추가결제금액}}원 · {{추가결제기한}} · {{추가결제URL}}',
      {
        customer: { business_name: '욜로피시카페' },
        billing: { amount: 250000, notes: '에어컨 2대 추가', due_date: '2026-11-10', payment_url: 'https://app.bbkorea.co.kr/portone/billing-pay/abc' },
      },
    )
    expect(text).toBe('욜로피시카페 · 에어컨 2대 추가 · 250,000원 · 2026.11.10 · https://app.bbkorea.co.kr/portone/billing-pay/abc')
  })
  it('현금 고객처럼 링크가 없으면 빈 문자열', () => {
    const text = renderTemplate('[{{추가결제URL}}]', { billing: { amount: 1000, payment_url: null } })
    expect(text).toBe('[]')
  })
})
