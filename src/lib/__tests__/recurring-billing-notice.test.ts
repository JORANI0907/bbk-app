import { describe, it, expect, vi } from 'vitest'

// 발송·DB 모듈은 서버 전용이라 단위 테스트에서는 비워 둔다 (순수 함수만 검증)
vi.mock('../supabase/server', () => ({ createServiceClient: () => ({}) }))
vi.mock('../template-sender', () => ({ sendByTemplate: vi.fn() }))
vi.mock('../notification', () => ({ saveNotificationHistory: vi.fn() }))
vi.mock('../billing-link', () => ({ issueBillingLink: vi.fn() }))
vi.mock('../billing-charge', () => ({ chargeBillingWithKey: vi.fn() }))
vi.mock('../slack', () => ({ sendSlack: vi.fn() }))

import {
  pickRecurringBillingTemplate,
  pickAutopayNoticeTemplate,
  hasActiveBillingKey,
  shouldSendAutopayNoticeInstead,
  buildRecurringBillingContext,
} from '../recurring-billing-notice'
import { renderTemplate } from '../notification-renderer'

const keyed = { billing_key: 'bk_1', billing_key_status: 'active' }
const noKey = { billing_key: null, billing_key_status: 'none' }

describe('템플릿 선택', () => {
  it('결제 링크 안내는 결제방식별, 예정 안내는 고객 유형별', () => {
    expect(pickRecurringBillingTemplate('정기딥케어', 'credit_card')).toBe('정기결제알림(카드)_정기딥')
    expect(pickAutopayNoticeTemplate('정기딥케어')).toBe('정기결제예정알림_정기딥')
    expect(pickAutopayNoticeTemplate('정기엔드케어')).toBe('정기결제예정알림_정기엔드')
  })
})

describe('shouldSendAutopayNoticeInstead — 자동결제 고객에게는 결제 페이지를 보내지 않는다', () => {
  it('카드가 없으면 기존대로 링크', () => {
    expect(hasActiveBillingKey(noKey)).toBe(false)
    expect(shouldSendAutopayNoticeInstead({ due_date: '2026-11-20', customer: noKey }, '2026-11-18')).toBe(false)
  })

  it('카드가 있고 결제기한 전·당일이면 예정 안내', () => {
    expect(shouldSendAutopayNoticeInstead({ due_date: '2026-11-20', customer: keyed }, '2026-11-18')).toBe(true)
    expect(shouldSendAutopayNoticeInstead({ due_date: '2026-11-20', customer: keyed }, '2026-11-20')).toBe(true)
  })

  it('결제기한이 지났으면(카드 결제 실패 가능성) 링크 안내로 되돌린다', () => {
    expect(shouldSendAutopayNoticeInstead({ due_date: '2026-11-20', customer: keyed }, '2026-11-21')).toBe(false)
  })

  it('카드가 등록돼 있어도 상태가 active 가 아니면 링크', () => {
    expect(hasActiveBillingKey({ billing_key: 'bk_1', billing_key_status: 'revoked' })).toBe(false)
  })
})

describe('예정 안내 본문 렌더', () => {
  it('결제 예정일·금액·카드가 들어가고 결제 링크는 비어 있다', () => {
    const ctx = buildRecurringBillingContext(
      { business_name: '홍콩웍헤이', contact_name: '대표', contact_phone: '01012345678', customer_type: '정기딥케어',
        payment_method: 'credit_card', account_number: null, billing_key_card_name: '신한카드 1234' },
      { amount: 220000, due_date: '2026-11-20', payment_url: null },
    )
    const text = renderTemplate(
      '{{업체명}} · {{다음결제일}} · {{계약금액}}원 · {{자동결제카드}} · [{{잔금결제URL}}]', ctx,
    )
    expect(text).toContain('홍콩웍헤이')
    expect(text).toContain('220,000원')
    expect(text).toContain('신한카드 1234')
    expect(text).toMatch(/2026[.\-년 ]*11[.\-월 ]*20/)
    expect(text).toContain('[]')
  })
})
