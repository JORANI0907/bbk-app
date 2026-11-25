import { describe, it, expect } from 'vitest'
import { billingMethodChip, paidMethodShortLabel, resolvePaidPatch } from '@/lib/billing-paid-method'

const cur = (over: Partial<{ status: string; paid_method: string | null; paid_via: string | null; payment_method_snapshot: string | null }> = {}) => ({
  status: 'pending', paid_method: null, paid_via: null, payment_method_snapshot: null, ...over,
})

describe('paidMethodShortLabel', () => {
  it('영문 코드와 레거시 한글 값을 모두 짧은 라벨로', () => {
    expect(paidMethodShortLabel('credit_card')).toBe('카드')
    expect(paidMethodShortLabel('virtual_account')).toBe('가상계좌')
    expect(paidMethodShortLabel('계좌이체')).toBe('계좌이체')
    expect(paidMethodShortLabel('현금(비과세)')).toBe('비과세 현금')
    expect(paidMethodShortLabel(null)).toBeNull()
    expect(paidMethodShortLabel('???')).toBeNull()
  })
})

describe('billingMethodChip', () => {
  it('완료 건은 실제 수단 + 경로', () => {
    expect(billingMethodChip({ status: 'paid', paid_method: 'virtual_account', paid_via: 'app_link' })?.label).toBe('가상계좌(앱)')
    expect(billingMethodChip({ status: 'paid', paid_method: 'bank_transfer', paid_via: 'manual' })?.label).toBe('계좌이체(수동)')
    expect(billingMethodChip({ status: 'paid', paid_method: 'credit_card', paid_via: 'autopay' })?.label).toBe('카드 자동결제')
  })

  it('과거 완료 건(기록 없음)은 칩 없음', () => {
    expect(billingMethodChip({ status: 'paid', paid_method: null, paid_via: null, payment_method_snapshot: 'virtual_account' })).toBeNull()
  })

  it('대기·지연 건은 예정 수단을 보여 준다', () => {
    const chip = billingMethodChip({ status: 'pending', payment_method_snapshot: 'credit_card' })
    expect(chip).toEqual(expect.objectContaining({ label: '예정: 카드', kind: 'expected' }))
    expect(billingMethodChip({ status: 'overdue', payment_method_snapshot: null })).toBeNull()
  })
})

describe('resolvePaidPatch', () => {
  it('완료로 바꾸면 수단은 입력값 → 예정 수단 → 고객 마스터 순, 경로는 manual', () => {
    expect(resolvePaidPatch({ status: 'paid', paid_method: 'bank_transfer', current: cur({ payment_method_snapshot: 'credit_card' }) }))
      .toEqual({ ok: true, patch: { paid_method: 'bank_transfer', paid_via: 'manual' } })
    expect(resolvePaidPatch({ status: 'paid', current: cur({ payment_method_snapshot: 'virtual_account' }), customerMethod: 'credit_card' }))
      .toEqual({ ok: true, patch: { paid_method: 'virtual_account', paid_via: 'manual' } })
    expect(resolvePaidPatch({ status: 'paid', current: cur(), customerMethod: '카드(온라인 간편결제)' }))
      .toEqual({ ok: true, patch: { paid_method: 'credit_card', paid_via: 'manual' } })
  })

  it('예정 수단도 고객 마스터도 없으면 수단은 비운 채 완료', () => {
    expect(resolvePaidPatch({ status: 'paid', current: cur() })).toEqual({ ok: true, patch: { paid_method: null, paid_via: 'manual' } })
  })

  it('완료 상태에서 수단만 고치면 경로는 유지', () => {
    expect(resolvePaidPatch({ paid_method: 'credit_card', current: cur({ status: 'paid', paid_method: 'virtual_account', paid_via: 'app_link' }) }))
      .toEqual({ ok: true, patch: { paid_method: 'credit_card', paid_via: 'app_link' } })
  })

  it('완료를 취소하면 두 칸을 비운다', () => {
    expect(resolvePaidPatch({ status: 'pending', current: cur({ status: 'paid', paid_method: 'credit_card', paid_via: 'manual' }) }))
      .toEqual({ ok: true, patch: { paid_method: null, paid_via: null } })
  })

  it('상태·수단을 건드리지 않으면 아무것도 바꾸지 않는다', () => {
    expect(resolvePaidPatch({ current: cur({ status: 'paid', paid_method: 'credit_card', paid_via: 'autopay' }) })).toEqual({ ok: true, patch: {} })
    expect(resolvePaidPatch({ status: 'paid', current: cur({ status: 'paid', paid_method: 'credit_card', paid_via: 'autopay' }) })).toEqual({ ok: true, patch: {} })
  })

  it('대기 건에 수단만 보내거나 이상한 값이면 거절', () => {
    expect(resolvePaidPatch({ paid_method: 'credit_card', current: cur() }).ok).toBe(false)
    expect(resolvePaidPatch({ status: 'paid', paid_method: 'bitcoin', current: cur() }).ok).toBe(false)
    expect(resolvePaidPatch({ status: 'paid', paid_via: 'fax', current: cur() }).ok).toBe(false)
  })
})
