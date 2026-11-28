/**
 * 홈택스 CSV 행(HometaxRow) → 볼타 정발행 요청 본문 변환
 *
 * CSV 경로와 볼타 경로가 같은 HometaxRow 를 입력으로 쓰므로,
 * 화면에서 확인한 내용이 두 경로에 동일하게 반영된다.
 *
 * 볼타 스키마 (docs.bolta.io/api-reference/tax-invoice-issuance/issue-tax-invoice):
 *  date YYYY-MM-DD · purpose RECEIPT|CLAIM · taxType TAXABLE|ZERO_RATE|TAX_FREE
 *  supplier.manager {email 필수} · supplied.managers 1~2명 {email 필수}
 *  items 1~16 {date, name≤100, supplyCost int, tax int|null, specification≤60, description≤100}
 */

import type { HometaxRow, HometaxItem } from '@/lib/hometax-csv'

export type BoltaPurpose = 'RECEIPT' | 'CLAIM'
export type BoltaTaxType = 'TAXABLE' | 'ZERO_RATE' | 'TAX_FREE'

export interface BoltaManager {
  email: string
  name: string | null
  telephone: string | null
}

export interface BoltaParty {
  identificationNumber: string
  organizationName: string
  representativeName: string
  address: string | null
  businessType: string | null
  businessItem: string | null
}

export interface BoltaSupplier extends BoltaParty {
  manager: BoltaManager
}

export interface BoltaSupplied extends BoltaParty {
  managers: BoltaManager[]
}

export interface BoltaItem {
  date: string
  name: string
  specification: string | null
  quantity: number | null
  unitPrice: number | null
  supplyCost: number
  tax: number | null
  description: string | null
}

export interface BoltaIssueRequest {
  date: string
  purpose: BoltaPurpose
  taxType: BoltaTaxType
  supplier: BoltaSupplier
  supplied: BoltaSupplied
  items: BoltaItem[]
  description: string | null
}

export class BoltaMappingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BoltaMappingError'
  }
}

const MAX_ITEMS = 16
/** 과세 건 세액 허용 오차 (반올림 차이) */
const TAX_TOLERANCE_WON = 10
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function digitsOnly(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '')
}

function clip(s: string | null | undefined, max: number): string | null {
  const t = (s ?? '').trim()
  if (!t) return null
  return t.length > max ? t.slice(0, max) : t
}

/** 'YYYYMMDD' → 'YYYY-MM-DD' */
export function ymdToIso(yyyymmdd: string): string {
  if (!/^\d{8}$/.test(yyyymmdd)) throw new BoltaMappingError(`작성일자 형식 오류: ${yyyymmdd}`)
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`
}

function requireEmail(email: string | null | undefined, who: string): string {
  const e = (email ?? '').trim()
  if (!EMAIL_RE.test(e)) throw new BoltaMappingError(`${who} 이메일이 없거나 형식이 틀립니다`)
  return e
}

function mapItem(item: HometaxItem, date: string, taxType: BoltaTaxType): BoltaItem {
  const name = clip(item.name, 100)
  if (!name) throw new BoltaMappingError('품목명이 비어 있습니다')
  const supplyCost = Math.round(Number(item.supply_amount))
  if (!Number.isFinite(supplyCost) || supplyCost <= 0) {
    throw new BoltaMappingError(`품목 "${name}" 공급가액이 0 이하입니다`)
  }
  const tax = taxType === 'TAXABLE'
    ? Math.round(Number(item.vat ?? 0))
    : taxType === 'ZERO_RATE' ? 0 : null
  if (taxType === 'TAXABLE' && tax !== null && Math.abs(tax - Math.round(supplyCost * 0.1)) > TAX_TOLERANCE_WON) {
    throw new BoltaMappingError(`품목 "${name}" 세액(${tax})이 공급가액의 10%(${Math.round(supplyCost * 0.1)})와 다릅니다`)
  }
  return {
    date,
    name,
    specification: clip(item.spec, 60),
    quantity: item.qty != null && item.qty > 0 ? item.qty : null,
    unitPrice: item.unit_price != null ? Math.round(Number(item.unit_price)) : null,
    supplyCost,
    tax,
    description: clip(item.remark, 100),
  }
}

/**
 * HometaxRow → 볼타 요청. 필수값이 빠지면 BoltaMappingError 를 던진다.
 * 검증 실패는 DB 를 건드리지 않고 화면에 그대로 보여 주기 위해 예외로 처리한다.
 */
export function mapRowToBoltaRequest(row: HometaxRow): BoltaIssueRequest {
  const date = ymdToIso(row.written_date)
  const taxType: BoltaTaxType = row.invoice_kind === '02' ? 'ZERO_RATE' : 'TAXABLE'
  const purpose: BoltaPurpose = row.receipt_type === '02' ? 'CLAIM' : 'RECEIPT'

  const supplierNo = digitsOnly(row.supplier.registration_number)
  if (supplierNo.length !== 10) throw new BoltaMappingError('공급자 사업자번호는 10자리여야 합니다')
  const receiverNo = digitsOnly(row.receiver.registration_number)
  if (receiverNo.length !== 10 && receiverNo.length !== 13) {
    throw new BoltaMappingError(`공급받는자 사업자번호가 10자리가 아닙니다 (${row.receiver.business_name})`)
  }

  const receiverName = clip(row.receiver.business_name, 70)
  if (!receiverName) throw new BoltaMappingError('공급받는자 상호가 비어 있습니다')
  const receiverRep = clip(row.receiver.owner_name, 30) ?? receiverName

  if (row.items.length === 0) throw new BoltaMappingError('품목이 없습니다')
  if (row.items.length > MAX_ITEMS) throw new BoltaMappingError(`품목은 최대 ${MAX_ITEMS}개입니다`)

  const managers: BoltaManager[] = [
    { email: requireEmail(row.receiver.email, `공급받는자(${receiverName})`), name: receiverRep, telephone: null },
  ]
  const email2 = (row.receiver.email_2 ?? '').trim()
  if (email2 && EMAIL_RE.test(email2) && email2 !== managers[0].email) {
    managers.push({ email: email2, name: null, telephone: null })
  }

  return {
    date,
    purpose,
    taxType,
    supplier: {
      identificationNumber: supplierNo,
      organizationName: clip(row.supplier.company_name, 70) ?? '',
      representativeName: clip(row.supplier.representative, 30) ?? '',
      address: clip(row.supplier.address, 150),
      businessType: clip(row.supplier.business_type, 100),
      businessItem: clip(row.supplier.business_item, 100),
      manager: {
        email: requireEmail(row.supplier.email, '공급자'),
        name: clip(row.supplier.representative, 30),
        telephone: null,
      },
    },
    supplied: {
      identificationNumber: receiverNo,
      organizationName: receiverName,
      representativeName: receiverRep,
      address: clip(row.receiver.address, 150),
      businessType: clip(row.receiver.business_type, 100),
      businessItem: clip(row.receiver.business_item, 100),
      managers,
    },
    items: row.items.map(it => mapItem(it, date, taxType)),
    description: null,
  }
}
