import { describe, it, expect } from 'vitest'
import {
  buildHometaxRow, buildItems, issueDeadlineOf, paidDateOf, toYmd, ymdToDateInput,
  type RowCandidate, type RowSupplier,
} from '@/lib/tax-invoice-rows'
import { buildClientReferenceId, isDefiniteRejection } from '@/lib/tax-invoice-issue'
import { BoltaApiError } from '@/lib/bolta/client'

const supplierA: RowSupplier = {
  id: 'sup-a', registration_number: '3988104260', company_name: '범빌드코리아 주식회사', representative: '조동환',
  address: '성남', business_type: '서비스', business_item: '청소', email: 'a@bbk.kr',
}
const supplierB: RowSupplier = { ...supplierA, id: 'sup-b', registration_number: '2987800455', company_name: '범빌드코리아' }

const billingCandidate = (over: Partial<RowCandidate> = {}): RowCandidate => ({
  source: 'billing', source_id: 'b1', customer_id: 'c1', billing_id: 'b1',
  service_type: '정기딥케어', business_name: '가게', business_number: '1234567890', owner_name: '사장',
  address: null, email: 'x@y.com', supply_amount: 300000, vat: 30000,
  display_period: '2026년 11월', construction_date: null, paid_date: '2026-11-03',
  draft_supplier_id: null, draft_items: null, draft_receiver_business_type: null, draft_receiver_business_item: null,
  draft_receiver_email_2: null, draft_receipt_type: null, draft_invoice_kind: null,
  ...over,
})

describe('날짜 유틸', () => {
  it('toYmd: 날짜·ISO 문자열 → YYYYMMDD, 아니면 null', () => {
    expect(toYmd('2026-11-03')).toBe('20261103')
    expect(toYmd('2026-11-03T05:00:00.000Z')).toBe('20261103')
    expect(toYmd(null)).toBeNull()
    expect(toYmd('abc')).toBeNull()
  })
  it('ymdToDateInput', () => {
    expect(ymdToDateInput('20261103')).toBe('2026-11-03')
  })
  it('issueDeadlineOf: 다음 달 10일, 연말은 다음 해 1월', () => {
    expect(issueDeadlineOf('20261105')).toBe('20261210')
    expect(issueDeadlineOf('20261231')).toBe('20270110')
  })
})

describe('paidDateOf', () => {
  it('정기 청구서는 paid_date', () => {
    expect(paidDateOf(billingCandidate())).toBe('20261103')
  })
  it('1회성은 balance_paid_at', () => {
    const c = billingCandidate({ source: 'application', source_id: 'a1', billing_id: null, paid_date: null, balance_paid_at: '2026-10-20T10:00:00+09:00' })
    expect(paidDateOf(c)).toBe('20261020')
  })
  it('둘 다 없으면 null (호출자가 오늘로 대체)', () => {
    expect(paidDateOf(billingCandidate({ paid_date: null }))).toBeNull()
  })
})

describe('buildItems / buildHometaxRow', () => {
  it('초안 품목이 없으면 서비스유형 + 기간으로 1개 생성', () => {
    const items = buildItems(billingCandidate())
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ name: '정기딥케어 - 2026년 11월', supply_amount: 300000, vat: 30000, qty: 1 })
  })
  it('초안 품목은 최대 4개, 단가 없으면 공급가액으로', () => {
    const draft_items = Array.from({ length: 6 }, (_, i) => ({ name: `품목${i}`, supply_amount: 1000, vat: 100 }))
    const items = buildItems(billingCandidate({ draft_items }))
    expect(items).toHaveLength(4)
    expect(items[0].unit_price).toBe(1000)
  })
  it('초안 공급자가 있으면 그 공급자, 없으면 기본 공급자', () => {
    const rowDefault = buildHometaxRow(billingCandidate(), '20261103', [supplierA, supplierB], supplierA)
    expect(rowDefault.supplier.registration_number).toBe('3988104260')
    const rowB = buildHometaxRow(billingCandidate({ draft_supplier_id: 'sup-b' }), '20261103', [supplierA, supplierB], supplierA)
    expect(rowB.supplier.registration_number).toBe('2987800455')
    const rowMissing = buildHometaxRow(billingCandidate({ draft_supplier_id: 'nope' }), '20261103', [supplierA, supplierB], supplierA)
    expect(rowMissing.supplier.registration_number).toBe('3988104260')
  })
  it('작성일자·영수/청구·일반/영세율 반영', () => {
    const row = buildHometaxRow(billingCandidate({ draft_receipt_type: '02', draft_invoice_kind: '02' }), '20261103', [], supplierA)
    expect(row.written_date).toBe('20261103')
    expect(row.receipt_type).toBe('02')
    expect(row.invoice_kind).toBe('02')
  })
})

describe('buildClientReferenceId', () => {
  it('소스·ID·시도번호로 고유 키', () => {
    expect(buildClientReferenceId('billing', 'b1', 1)).toBe('bbk-billing-b1-1')
    expect(buildClientReferenceId('billing', 'b1', 2)).not.toBe(buildClientReferenceId('billing', 'b1', 1))
  })
})

describe('isDefiniteRejection — 볼타가 받지 않았다고 확정할 수 있는 오류', () => {
  const err = (status: number, code = 'X') => new BoltaApiError(status, code, 'm', null)
  it('400·401·404 는 확정 실패', () => {
    expect(isDefiniteRejection(err(400))).toBe(true)
    expect(isDefiniteRejection(err(404))).toBe(true)
  })
  it('429·5xx·INVALID_RESPONSE 는 접수됐을 수 있어 확정하지 않음', () => {
    expect(isDefiniteRejection(err(429))).toBe(false)
    expect(isDefiniteRejection(err(502))).toBe(false)
    expect(isDefiniteRejection(err(200, 'INVALID_RESPONSE'))).toBe(false)
  })
})
