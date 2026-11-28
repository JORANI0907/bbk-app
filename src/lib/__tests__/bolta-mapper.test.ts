import { describe, it, expect } from 'vitest'
import { mapRowToBoltaRequest, ymdToIso, BoltaMappingError } from '@/lib/bolta/mapper'
import type { HometaxRow } from '@/lib/hometax-csv'

const baseRow = (): HometaxRow => ({
  invoice_kind: '01',
  written_date: '20261105',
  supplier: {
    registration_number: '398-81-04260',
    company_name: '범빌드코리아 주식회사',
    representative: '조동환',
    address: '경기도 성남시',
    business_type: '사업시설 관리',
    business_item: '건축물 일반 청소업',
    email: 'sunrise@bbkorea.co.kr',
  },
  receiver: {
    registration_number: '123-45-67890',
    business_name: '테스트식당',
    owner_name: '김대표',
    address: '서울시 강남구',
    email: 'owner@test.com',
    email_2: 'acct@test.com',
  },
  items: [
    { name: '정기딥케어 - 2026년 11월', qty: 1, unit_price: 500000, supply_amount: 500000, vat: 50000 },
  ],
  receipt_type: '01',
})

describe('ymdToIso', () => {
  it('YYYYMMDD → YYYY-MM-DD', () => {
    expect(ymdToIso('20261105')).toBe('2026-11-05')
  })
  it('형식 오류는 예외', () => {
    expect(() => ymdToIso('2026-11-05')).toThrow(BoltaMappingError)
  })
})

describe('mapRowToBoltaRequest — 정상', () => {
  it('기본 매핑: 과세·영수·사업자번호 하이픈 제거·담당자 2명', () => {
    const req = mapRowToBoltaRequest(baseRow())
    expect(req.date).toBe('2026-11-05')
    expect(req.purpose).toBe('RECEIPT')
    expect(req.taxType).toBe('TAXABLE')
    expect(req.supplier.identificationNumber).toBe('3988104260')
    expect(req.supplier.manager.email).toBe('sunrise@bbkorea.co.kr')
    expect(req.supplied.identificationNumber).toBe('1234567890')
    expect(req.supplied.managers).toHaveLength(2)
    expect(req.supplied.managers[0]).toMatchObject({ email: 'owner@test.com', name: '김대표' })
    expect(req.items).toHaveLength(1)
    expect(req.items[0]).toMatchObject({ date: '2026-11-05', supplyCost: 500000, tax: 50000, quantity: 1, unitPrice: 500000 })
  })

  it('청구(02) → CLAIM, 영세율(02) → ZERO_RATE 이며 tax 0', () => {
    const req = mapRowToBoltaRequest({ ...baseRow(), receipt_type: '02', invoice_kind: '02' })
    expect(req.purpose).toBe('CLAIM')
    expect(req.taxType).toBe('ZERO_RATE')
    expect(req.items[0].tax).toBe(0)
  })

  it('이메일2 가 이메일1 과 같으면 담당자 1명', () => {
    const row = baseRow()
    row.receiver.email_2 = row.receiver.email
    expect(mapRowToBoltaRequest(row).supplied.managers).toHaveLength(1)
  })

  it('대표자 없으면 상호로 대체', () => {
    const row = baseRow()
    row.receiver.owner_name = null
    expect(mapRowToBoltaRequest(row).supplied.representativeName).toBe('테스트식당')
  })

  it('품목명 100자, 규격 60자 초과는 잘림', () => {
    const row = baseRow()
    row.items[0].name = 'a'.repeat(150)
    row.items[0].spec = 'b'.repeat(80)
    const req = mapRowToBoltaRequest(row)
    expect(req.items[0].name).toHaveLength(100)
    expect(req.items[0].specification).toHaveLength(60)
  })
})

describe('mapRowToBoltaRequest — 실패', () => {
  it('공급받는자 이메일 없음', () => {
    const row = baseRow()
    row.receiver.email = null
    expect(() => mapRowToBoltaRequest(row)).toThrow(/이메일/)
  })
  it('공급받는자 사업자번호 자릿수 오류', () => {
    const row = baseRow()
    row.receiver.registration_number = '12345'
    expect(() => mapRowToBoltaRequest(row)).toThrow(/사업자번호/)
  })
  it('품목 없음', () => {
    expect(() => mapRowToBoltaRequest({ ...baseRow(), items: [] })).toThrow(/품목/)
  })
  it('공급가액 0', () => {
    const row = baseRow()
    row.items[0].supply_amount = 0
    expect(() => mapRowToBoltaRequest(row)).toThrow(/공급가액/)
  })
  it('과세 건 세액이 공급가액의 10%와 10원 넘게 다르면 거절', () => {
    const row = baseRow()
    row.items[0].vat = 30000
    expect(() => mapRowToBoltaRequest(row)).toThrow(/세액/)
  })
  it('반올림 차이(10원 이내)는 허용', () => {
    const row = baseRow()
    row.items[0].supply_amount = 333333
    row.items[0].vat = 33333
    expect(mapRowToBoltaRequest(row).items[0].tax).toBe(33333)
  })
  it('품목 17개 초과', () => {
    const row = baseRow()
    row.items = Array.from({ length: 17 }, () => ({ ...row.items[0] }))
    expect(() => mapRowToBoltaRequest(row)).toThrow(/최대 16/)
  })
})
