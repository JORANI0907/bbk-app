/**
 * 세금계산서 후보(Candidate) → 홈택스 행(HometaxRow) 변환
 *
 * 화면의 CSV 생성과 볼타 발행이 같은 함수를 쓴다.
 * (기존 page.tsx handleDownloadCsv 의 행 생성 로직을 분리, 2026-11-28)
 *
 * 작성일자 규칙 (대표 결정): 입금일 기준.
 *  - 정기 청구서: service_billings.paid_date
 *  - 1회성: service_applications.balance_paid_at (잔금 결제일)
 *  - 둘 다 없으면 오늘(KST). 모달에서 경고 표시 + 직접 수정 가능.
 */

import type { HometaxRow, HometaxItem, HometaxSupplier } from '@/lib/hometax-csv'

export interface RowSupplier extends HometaxSupplier {
  id: string
}

export interface RowDraftItem {
  name: string
  qty?: number
  unit_price?: number
  supply_amount?: number
  vat?: number
  spec?: string
  remark?: string
}

/** 행 생성에 필요한 후보 필드만 (page.tsx Candidate 와 구조 호환) */
export interface RowCandidate {
  source: 'application' | 'billing'
  source_id: string
  customer_id: string | null
  billing_id: string | null
  service_type: string | null
  business_name: string
  business_number: string | null
  owner_name: string
  address: string | null
  email: string | null
  supply_amount: number
  vat: number
  display_period: string | null
  construction_date: string | null
  balance_paid_at?: string | null
  paid_date?: string | null
  draft_supplier_id: string | null
  draft_items: RowDraftItem[] | null
  draft_receiver_business_type: string | null
  draft_receiver_business_item: string | null
  draft_receiver_email_2: string | null
  draft_receipt_type: string | null
  draft_invoice_kind: string | null
}

export const candidateKey = (c: Pick<RowCandidate, 'source' | 'source_id'>) => `${c.source}:${c.source_id}`

/** 'YYYY-MM-DD' 또는 ISO 문자열 → 'YYYYMMDD'. 형식이 아니면 null */
export function toYmd(value: string | null | undefined): string | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return m ? `${m[1]}${m[2]}${m[3]}` : null
}

/** 'YYYYMMDD' → 'YYYY-MM-DD' (input[type=date] 용) */
export function ymdToDateInput(ymd: string): string {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`
}

/** 입금일(YYYYMMDD). 없으면 null → 호출자가 오늘로 대체 */
export function paidDateOf(c: RowCandidate): string | null {
  if (c.source === 'billing') return toYmd(c.paid_date)
  return toYmd(c.balance_paid_at)
}

/**
 * 공급시기(입금일)가 속한 달의 다음 달 10일 (발행 기한). 'YYYYMMDD'
 * 예: 20261105 → 20261210
 */
export function issueDeadlineOf(ymd: string): string {
  const y = Number(ymd.slice(0, 4))
  const m = Number(ymd.slice(4, 6))
  const next = new Date(Date.UTC(y, m, 10)) // m 은 0-based 이므로 (m) = 다음 달
  const yy = next.getUTCFullYear()
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0')
  return `${yy}${mm}10`
}

export function buildItems(c: RowCandidate): HometaxItem[] {
  if (c.draft_items && c.draft_items.length > 0) {
    return c.draft_items.slice(0, 4).map(it => ({
      name: it.name,
      spec: it.spec ?? null,
      qty: it.qty ?? 1,
      unit_price: it.unit_price ?? Number(it.supply_amount ?? 0),
      supply_amount: Number(it.supply_amount ?? 0),
      vat: Number(it.vat ?? 0),
      remark: it.remark ?? null,
    }))
  }
  const periodLabel = c.display_period ?? c.construction_date?.slice(0, 10) ?? ''
  return [{
    name: `${c.service_type ?? '청소 서비스'}${periodLabel ? ` - ${periodLabel}` : ''}`,
    qty: 1,
    unit_price: c.supply_amount,
    supply_amount: c.supply_amount,
    vat: c.vat,
  }]
}

export function buildHometaxRow(
  c: RowCandidate,
  writtenDate: string,
  suppliers: RowSupplier[],
  defaultSupplier: RowSupplier,
): HometaxRow {
  const rowSupplier = c.draft_supplier_id
    ? (suppliers.find(s => s.id === c.draft_supplier_id) ?? defaultSupplier)
    : defaultSupplier

  return {
    invoice_kind: c.draft_invoice_kind === '02' ? '02' : '01',
    written_date: writtenDate,
    supplier: {
      registration_number: rowSupplier.registration_number,
      company_name: rowSupplier.company_name,
      representative: rowSupplier.representative,
      address: rowSupplier.address,
      business_type: rowSupplier.business_type,
      business_item: rowSupplier.business_item,
      email: rowSupplier.email,
    },
    receiver: {
      registration_number: c.business_number,
      business_name: c.business_name,
      owner_name: c.owner_name,
      address: c.address,
      business_type: c.draft_receiver_business_type,
      business_item: c.draft_receiver_business_item,
      email: c.email,
      email_2: c.draft_receiver_email_2,
    },
    items: buildItems(c),
    receipt_type: c.draft_receipt_type === '02' ? '02' : '01',
  }
}
