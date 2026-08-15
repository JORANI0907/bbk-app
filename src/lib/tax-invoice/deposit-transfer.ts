/**
 * 세금계산서 탭 — 예약금 이체 xls 생성
 * 국민은행 obiz 대량이체 템플릿 재사용
 * 대상: payment_method === '카드(온라인 간편결제)' 인 고객
 */

import * as XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'
import { parseAccount } from '@/lib/payroll/exportData'
import { bankNameToCode } from '@/lib/bankCodes'

const TEMPLATE_PATH = path.join(
  process.cwd(),
  'src/lib/payroll/templates/obiz_bank_transfer.xls',
)
const EXAMPLE_ROWS = 12

export const DEPOSIT_AMOUNT = 80000
export const CARD_PAYMENT_METHOD = '카드(온라인 간편결제)'

export interface DepositCandidate {
  business_name: string
  contact_name: string | null
  payment_method: string | null
  account_number: string | null
}

export interface DepositTransferResult {
  buffer: Buffer
  skipped: SkipRecord[]
}

export interface SkipRecord {
  business_name: string
  reason: string
}

function buildCell(v: string | number, t: 's' | 'n'): XLSX.CellObject {
  return { v, t, ...(t === 's' ? { z: '@' } : {}) }
}

export async function buildDepositTransferXls(
  candidates: DepositCandidate[],
): Promise<DepositTransferResult> {
  const cardCandidates = candidates.filter(
    c => c.payment_method === CARD_PAYMENT_METHOD,
  )

  const skipped: SkipRecord[] = []

  type TransferRow = {
    bankCode: string
    accountNumber: string
    name: string
  }

  const rows: TransferRow[] = []

  for (const c of cardCandidates) {
    if (!c.account_number?.trim()) {
      skipped.push({ business_name: c.business_name, reason: '계좌번호 없음' })
      continue
    }

    const parsed = parseAccount(c.account_number)
    const bankCode = bankNameToCode(parsed.bank) ?? ''
    const accountNumber = parsed.number.replace(/-/g, '')
    const recipientName = c.contact_name?.trim() || c.business_name

    if (!bankCode) {
      skipped.push({
        business_name: c.business_name,
        reason: `은행명 인식 실패 (원본: "${c.account_number}")`,
      })
      continue
    }

    if (!accountNumber) {
      skipped.push({
        business_name: c.business_name,
        reason: `계좌번호 파싱 실패 (원본: "${c.account_number}")`,
      })
      continue
    }

    rows.push({ bankCode, accountNumber, name: recipientName })
  }

  const templateBuffer = fs.readFileSync(TEMPLATE_PATH)
  const workbook = XLSX.read(templateBuffer, {
    type: 'buffer',
    cellStyles: true,
    cellNF: true,
  })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]

  // 기존 예시 데이터 clear
  for (let r = 0; r < EXAMPLE_ROWS; r++) {
    for (let c = 0; c < 7; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      delete sheet[addr]
    }
  }

  // 데이터 채우기
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    const setCell = (c: number, cell: XLSX.CellObject) => {
      sheet[XLSX.utils.encode_cell({ r, c })] = cell
    }
    setCell(0, buildCell(row.bankCode, 's'))
    setCell(1, buildCell(row.accountNumber, 's'))
    setCell(2, buildCell(DEPOSIT_AMOUNT, 'n'))
    setCell(3, buildCell(row.name, 's'))
    setCell(4, buildCell('예약금', 's'))
    setCell(5, buildCell('예약금환급', 's'))
    setCell(6, buildCell(row.name, 's'))
  }

  // !ref 갱신
  const currentRef = sheet['!ref']
  if (currentRef) {
    const range = XLSX.utils.decode_range(currentRef)
    const newEndRow = Math.max(range.e.r, rows.length - 1, EXAMPLE_ROWS - 1)
    sheet['!ref'] = XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: newEndRow, c: Math.max(range.e.c, 6) },
    })
  }

  const outBuffer = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'biff8',
  }) as Buffer

  return { buffer: outBuffer, skipped }
}
